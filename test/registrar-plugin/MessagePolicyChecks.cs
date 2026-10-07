using System;
using System.Linq;
using Mtc.Registrar;

internal static class MessagePolicyChecks
{
    public static void Run(Action<bool, string> check)
    {
        const string result = "mx.microsoft.com 1; spf=pass (sender IP is 192.0.2.1) smtp.mailfrom=business.example; dkim=pass (signature was verified) header.d=business.example; dmarc=pass action=none header.from=business.example; compauth=pass reason=100";
        Func<string, ReceivingHeader[]> headers = value => new[]
        {
            new ReceivingHeader { Name = "Authentication-Results", Value = value },
            new ReceivingHeader { Name = "X-MS-Exchange-Organization-AuthSource", Value = "receiver.prod.outlook.com" },
            new ReceivingHeader { Name = "X-MS-Exchange-Organization-MessageDirectionality", Value = "Incoming" }
        };
        var valid = MessagePolicy.Assess("contact@business.example", "contact@business.example",
            Array.Empty<string>(), headers(result), true);
        check(valid.Known && valid.AuthenticationAligned, "A complete aligned receiving result and active registry can be a Known candidate.");
        check(!MessagePolicy.Assess("contact@business.example", "contact@business.example",
            Array.Empty<string>(), headers(result), false).Known, "Authentication alone cannot recognize a sender.");
        foreach (var invalid in new[]
        {
            result.Replace("mx.microsoft.com 1", "mx.microsoft.com.evil.example"),
            result.Replace("spf=pass", "spf=passx"),
            result.Replace("dkim=pass", "dkim=fail"),
            result.Replace("dmarc=pass", "dmarc=fail"),
            result.Replace("compauth=pass", "compauth=none"),
            result.Replace("header.from=business.example", "header.from=other.example"),
            result + "; dmarc=pass",
            result + "; header.from=other.example"
        })
            check(!MessagePolicy.Assess("contact@business.example", "contact@business.example",
                Array.Empty<string>(), headers(invalid), true).Known, "Malformed, failed, duplicate, or misaligned authentication must not be Known.");
        var duplicated = headers(result).Concat(new[] { new ReceivingHeader { Name = "Authentication-Results", Value = "mx.microsoft.com; spf=fail" } }).ToArray();
        check(!MessagePolicy.Assess("contact@business.example", null, Array.Empty<string>(), duplicated, true).Known,
            "Count all Authentication-Results headers, not only passing ones.");
        check(!MessagePolicy.Assess("contact@business.example", "other@business.example", Array.Empty<string>(), headers(result), true).Known,
            "Conflicting Sender must fail closed.");
        check(!MessagePolicy.Assess("contact@business.example", null, new[] { "other@business.example" }, headers(result), true).Known,
            "Unapproved Reply-To must fail closed.");
        check(!MessagePolicy.Assess("bad@@business.example", null, Array.Empty<string>(), headers(result), true).Known,
            "Malformed From must fail closed.");
        check(!MessagePolicy.Assess("contact@business.example", null, Array.Empty<string>(), null, true).Known,
            "Missing receiving evidence must fail closed.");
        var multipleDkim = result.Replace("dkim=pass (signature was verified) header.d=business.example",
            "dkim=pass header.d=business.example; dkim=pass header.d=mailer.example");
        check(MessagePolicy.Assess("contact@business.example", null, Array.Empty<string>(), headers(multipleDkim), true).Known,
            "Multiple passing DKIM signatures do not invalidate exact DMARC From alignment.");
        var organization = Guid.NewGuid();
        Func<string, string, string, ReceivingHeader[]> internalHeaders = (direction, authAs, crossTenant) => new[]
        {
            new ReceivingHeader { Name = "Authentication-Results", Value = "mx.microsoft.com 1; dkim=none (message not signed) header.d=none;dmarc=none action=none header.from=business.example;" },
            new ReceivingHeader { Name = "X-MS-Exchange-Organization-AuthSource", Value = "sender.namprd20.prod.outlook.com" },
            new ReceivingHeader { Name = "X-MS-Exchange-Organization-MessageDirectionality", Value = direction },
            new ReceivingHeader { Name = "X-MS-Exchange-Organization-AuthAs", Value = authAs },
            new ReceivingHeader { Name = "X-MS-Exchange-CrossTenant-AuthAs", Value = crossTenant }
        };
        var internalMail = MessagePolicy.Assess("staff@business.example", "staff@business.example",
            Array.Empty<string>(), internalHeaders("Originating", "Internal", "Internal"), true);
        check(internalMail.Known && internalMail.Reason == "MTC_ACTIVE_REGISTRY_AND_INTERNAL_AUTHENTICATED_SUBMISSION",
            "Authenticated internal submission from an approved domain is Known.");
        check(!MessagePolicy.Assess("staff@business.example", null, Array.Empty<string>(),
            internalHeaders("Originating", "Internal", "Internal"), false).Known, "Internal submission alone cannot recognize a sender.");
        foreach (var external in new[] { internalHeaders("Incoming", "Internal", "Internal"),
            internalHeaders("Originating", "Anonymous", "Internal"), internalHeaders("Originating", "Internal", "Anonymous"),
            internalHeaders("Incoming", "Anonymous", "Anonymous") })
            check(!MessagePolicy.Assess("staff@business.example", null, Array.Empty<string>(), external, true).Known,
                "Inbound or anonymous mail must not use the internal-submission path.");
        var injected = internalHeaders("Originating", "Internal", "Internal").Concat(new[]
            { new ReceivingHeader { Name = "X-MS-Exchange-Organization-AuthAs", Value = "Internal" } }).ToArray();
        check(!MessagePolicy.Assess("staff@business.example", null, Array.Empty<string>(), injected, true).Known,
            "Duplicate internal-submission stamps must fail closed.");
        check(!MessagePolicy.Assess("staff@business.example", "other@business.example", Array.Empty<string>(),
            internalHeaders("Originating", "Internal", "Internal"), true).Known, "Internal path still enforces Sender identity.");
        check(AssessmentIdentity.ForMessage(organization, "mailbox@customer.example", "AaOpaqueID") !=
            AssessmentIdentity.ForMessage(organization, "mailbox@customer.example", "AAOpaqueID"),
            "Case-distinct Graph IDs must have distinct deterministic assessment keys.");
        check(AssessmentIdentity.ForMessage(organization, "Mailbox@customer.example", "AaOpaqueID") ==
            AssessmentIdentity.ForMessage(organization, "mailbox@customer.example", "AaOpaqueID"),
            "Microsoft mailbox-address casing must not duplicate assessment keys.");
        var matching = new Microsoft.Xrm.Sdk.Entity("mtc_messageassessment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "mailbox@customer.example", ["mtc_stablemessageid"] = "AaOpaqueID"
        };
        var otherCase = new Microsoft.Xrm.Sdk.Entity("mtc_messageassessment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "mailbox@customer.example", ["mtc_stablemessageid"] = "AAOpaqueID"
        };
        check(AssessmentIdentity.ExactLegacy(new[] { matching, otherCase }, "mailbox@customer.example", "AaOpaqueID").Single().Id == matching.Id,
            "A case-insensitive Dataverse lookup must be narrowed by ordinal immutable-ID matching.");
    }
}
