using System;
using System.Collections.Generic;
using System.Linq;
using System.Text.RegularExpressions;

namespace Mtc.Registrar
{
    public sealed class ReceivingHeader
    {
        public string Name { get; set; }
        public string Value { get; set; }
    }

    public sealed class MessageDecision
    {
        public bool Known { get; set; }
        public bool AuthenticationAligned { get; set; }
        public string Reason { get; set; }
    }

    public static class MessagePolicy
    {
        // A Reply-To that differs from From is accepted only when that reply address is itself an
        // approved sender (replyToApproved), so replies can never be diverted to an unverified party.
        public static MessageDecision Assess(string from, string sender, string[] replyTo,
            ReceivingHeader[] headers, bool registryApproved, Func<string, bool> replyToApproved = null)
        {
            var decision = new MessageDecision { Reason = "MTC_REGISTRY_NO_MATCH" };
            string address;
            try { address = VerificationPolicy.Target("contact", from); }
            catch (ArgumentException) { decision.Reason = "MTC_INVALID_FROM"; return decision; }
            var domain = address.Substring(address.LastIndexOf('@') + 1);
            if (!string.IsNullOrEmpty(sender))
            {
                try
                {
                    if (!string.Equals(VerificationPolicy.Target("contact", sender), address, StringComparison.Ordinal))
                    {
                        decision.Reason = "MTC_CONFLICTING_SENDER";
                        return decision;
                    }
                }
                catch (ArgumentException) { decision.Reason = "MTC_INVALID_SENDER"; return decision; }
            }
            foreach (var reply in replyTo ?? Array.Empty<string>())
            {
                string canonicalReply;
                try { canonicalReply = VerificationPolicy.Target("contact", reply); }
                catch (ArgumentException) { decision.Reason = "MTC_INVALID_REPLY_TO"; return decision; }
                if (string.Equals(canonicalReply, address, StringComparison.Ordinal)) continue;
                if (!registryApproved || replyToApproved == null || !replyToApproved(canonicalReply))
                {
                    decision.Reason = "MTC_UNSUPPORTED_REPLY_TO";
                    return decision;
                }
            }
            var all = headers ?? Array.Empty<ReceivingHeader>();
            var authentication = Exact(all, "Authentication-Results");
            var source = Exact(all, "X-MS-Exchange-Organization-AuthSource");
            var direction = Exact(all, "X-MS-Exchange-Organization-MessageDirectionality");
            // Mail sent by a signed-in user of this organization never crosses the inbound boundary, so it
            // carries Exchange's own authenticated-submission stamps instead of an inbound DMARC result.
            // Exchange strips externally supplied organization headers; exact counts reject injected duplicates.
            var authAs = Exact(all, "X-MS-Exchange-Organization-AuthAs");
            var crossTenantAuthAs = Exact(all, "X-MS-Exchange-CrossTenant-AuthAs");
            if (direction.Length == 1 && source.Length == 1 && authAs.Length == 1 && crossTenantAuthAs.Length == 1 &&
                Is(direction[0], "Originating") && Is(authAs[0], "Internal") && Is(crossTenantAuthAs[0], "Internal") &&
                Regex.IsMatch((source[0].Value ?? "").Trim(), @"^[a-z0-9.-]+\.(prod\.outlook\.com|outlook\.office365\.com)$", RegexOptions.IgnoreCase))
            {
                decision.AuthenticationAligned = true;
                decision.Known = registryApproved;
                decision.Reason = registryApproved ? "MTC_ACTIVE_REGISTRY_AND_INTERNAL_AUTHENTICATED_SUBMISSION" : "MTC_REGISTRY_NO_MATCH";
                return decision;
            }
            if (authentication.Length != 1 || source.Length != 1 || direction.Length != 1)
            {
                decision.Reason = "MTC_RECEIVING_BOUNDARY_MISSING_OR_AMBIGUOUS";
                return decision;
            }
            var sourceHost = (source[0].Value ?? "").Trim();
            if (!Regex.IsMatch(sourceHost, @"^[a-z0-9.-]+\.(prod\.outlook\.com|outlook\.office365\.com)$", RegexOptions.IgnoreCase) ||
                !string.Equals((direction[0].Value ?? "").Trim(), "Incoming", StringComparison.OrdinalIgnoreCase))
            {
                decision.Reason = "MTC_RECEIVING_BOUNDARY_UNSUPPORTED";
                return decision;
            }
            var result = Regex.Replace(authentication[0].Value ?? "", @"\r?\n[ \t]+", " ").Trim();
            // Microsoft's receiving result appears with the mx.microsoft.com authserv-id or, on some paths, without one.
            // Any other authserv-id is foreign and rejected; the exactly-one-header boundary above prevents injection.
            if (!Regex.IsMatch(result, @"^mx\.microsoft\.com(?:[ \t]+1)?[ \t]*;", RegexOptions.IgnoreCase) &&
                !Regex.IsMatch(result, @"^(?:spf|dkim|dmarc|compauth|arc)=", RegexOptions.IgnoreCase))
            {
                decision.Reason = "MTC_AUTH_SERVICE_UNSUPPORTED";
                return decision;
            }
            result = Regex.Replace(result, @"\([^()]*\)", " ");
            // DMARC pass means SPF or DKIM aligned with the visible From domain. bestguesspass is the same aligned
            // result for a domain that has not published a DMARC policy. Microsoft's composite verdict must also pass.
            var dmarc = Tokens(result, "dmarc");
            if (result.Contains("(") || result.Contains(")") || dmarc.Length != 1 ||
                !(string.Equals(dmarc[0], "pass", StringComparison.OrdinalIgnoreCase) ||
                  string.Equals(dmarc[0], "bestguesspass", StringComparison.OrdinalIgnoreCase)) ||
                !SinglePass(result, "compauth"))
            {
                decision.Reason = "MTC_AUTHENTICATION_FAILED_OR_AMBIGUOUS";
                return decision;
            }
            var headerFrom = Tokens(result, "header.from");
            if (headerFrom.Length != 1)
            {
                decision.Reason = "MTC_DMARC_ALIGNMENT_AMBIGUOUS";
                return decision;
            }
            string authenticatedDomain;
            try { authenticatedDomain = VerificationPolicy.Domain(headerFrom[0]); }
            catch (ArgumentException) { decision.Reason = "MTC_INVALID_AUTHENTICATED_DOMAIN"; return decision; }
            if (!string.Equals(domain, authenticatedDomain, StringComparison.Ordinal))
            {
                decision.Reason = "MTC_DMARC_FROM_MISALIGNED";
                return decision;
            }
            decision.AuthenticationAligned = true;
            decision.Known = registryApproved;
            decision.Reason = registryApproved ? "MTC_ACTIVE_REGISTRY_AND_ALIGNED_RECEIVING_AUTH" : "MTC_REGISTRY_NO_MATCH";
            return decision;
        }

        private static bool Is(ReceivingHeader header, string value)
        {
            return string.Equals((header.Value ?? "").Trim(), value, StringComparison.OrdinalIgnoreCase);
        }

        private static ReceivingHeader[] Exact(IEnumerable<ReceivingHeader> headers, string name)
        {
            return headers.Where(header => header != null &&
                string.Equals(header.Name, name, StringComparison.OrdinalIgnoreCase)).ToArray();
        }

        private static string[] Tokens(string value, string name)
        {
            return Regex.Matches(value, @"(?:^|[;\s])" + Regex.Escape(name) + @"=([^\s;]+)",
                RegexOptions.IgnoreCase).Cast<Match>().Select(match => match.Groups[1].Value).ToArray();
        }

        private static bool SinglePass(string result, string name)
        {
            var values = Tokens(result, name);
            return values.Length == 1 && string.Equals(values[0], "pass", StringComparison.OrdinalIgnoreCase);
        }
    }
}
