using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Mtc.Registrar
{
    public static class VerificationPolicy
    {
        private static readonly HashSet<string> ConsumerDomains = new HashSet<string>(
            new[] { "gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com",
                "yahoo.com", "icloud.com", "aol.com", "proton.me", "protonmail.com" },
            StringComparer.OrdinalIgnoreCase);

        private static readonly HashSet<string> SharedPlatformDomains = new HashSet<string>(
            new[] { "onmicrosoft.com", "sharepointonline.com", "sharepoint.com", "azurewebsites.net", "cloudapp.net",
                "windows.net", "amazonaws.com", "amazonses.com", "googleusercontent.com", "appspot.com",
                "herokuapp.com", "github.io", "sendgrid.net", "mailgun.org", "mcsv.net", "mailchimpapp.net" },
            StringComparer.OrdinalIgnoreCase);

        private static readonly HashSet<string> SecondLevelSuffixLabels = new HashSet<string>(
            new[] { "co", "com", "net", "org", "gov", "edu", "ac", "ltd", "plc", "gen", "or", "ne", "go" },
            StringComparer.OrdinalIgnoreCase);

        public static string Text(string value, string field, int maximum)
        {
            if (string.IsNullOrWhiteSpace(value) || value != value.Trim() || value.Length > maximum ||
                Regex.IsMatch(value, @"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]"))
                throw new ArgumentException(field + " is required and must not contain control characters.");
            return value;
        }

        public static string Domain(string value)
        {
            Text(value, "Business domain", 253);
            if (Regex.IsMatch(value, @"[\s/:@?#\\%]") || value.EndsWith(".", StringComparison.Ordinal))
                throw new ArgumentException("Enter only the exact business domain, without a URL or subdomain wildcard.");
            string normalized;
            try { normalized = new IdnMapping().GetAscii(value).ToLowerInvariant(); }
            catch (ArgumentException) { throw new ArgumentException("Unsupported business domain."); }
            if (normalized.Length > 253 || !normalized.Contains(".") || Regex.IsMatch(normalized, @"^[\d.]+$"))
                throw new ArgumentException("Unsupported business domain.");
            foreach (var part in normalized.Split('.'))
                if (!Regex.IsMatch(part, @"^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$"))
                    throw new ArgumentException("Unsupported business domain.");
            return normalized;
        }

        public static string Target(string type, string value)
        {
            if (type == "domain")
            {
                // "*.example.com" approves example.com and every subdomain of it.
                var wildcard = value != null && value.StartsWith("*.", StringComparison.Ordinal);
                var domain = Domain(wildcard ? value.Substring(2) : value);
                if (ConsumerDomains.Contains(domain))
                    throw new ArgumentException("Shared email providers cannot be approved as a domain. Verify the exact email address instead.");
                if (!wildcard) return domain;
                var labels = domain.Split('.');
                if (SharedPlatformDomains.Contains(domain) ||
                    (labels.Length == 2 && labels[1].Length == 2 && SecondLevelSuffixLabels.Contains(labels[0])))
                    throw new ArgumentException("This domain is shared by many organizations; a subdomain wildcard cannot be approved for it.");
                if (domain.Length > 251)
                    throw new ArgumentException("Unsupported business domain.");
                return "*." + domain;
            }

            if (type != "contact")
                throw new ArgumentException("Choose an exact email address or a business domain.");
            Text(value, "Email address", 320);
            var parts = value.Split('@');
            if (parts.Length != 2 || parts[0].Length > 64 ||
                !Regex.IsMatch(parts[0], @"^[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+)*$"))
                throw new ArgumentException("Unsupported email address.");
            return parts[0] + "@" + Domain(parts[1]);
        }

        public static bool IsConsumerDomain(string value) => ConsumerDomains.Contains(value);

        public static DateTime Expiry(DateTime expiry, DateTime now)
        {
            var utc = expiry.Kind == DateTimeKind.Unspecified
                ? DateTime.SpecifyKind(expiry, DateTimeKind.Utc) : expiry.ToUniversalTime();
            if (utc <= now)
                throw new ArgumentException("Verification expiry must be in the future.");
            return utc;
        }
    }
}
