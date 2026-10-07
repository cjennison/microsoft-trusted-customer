using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Query;

namespace Mtc.Registrar
{
    public sealed class MailboxRuntime : IPlugin
    {
        private static readonly ColumnSet MailboxColumns = new ColumnSet(
            "mtc_mailboxreference", "mtc_enrollmentstatus", "statecode", "mtc_checkpoint",
            "mtc_nextpageurl", "mtc_scanfrom", "mtc_scanuntil", "mtc_leaseid", "mtc_leaseexpireson",
            "mtc_registrycheckedon", "mtc_reassessmentdueon", "mtc_lasterror", "mtc_lastalerton",
            "mtc_healthstate", "mtc_excludedfolderids", "versionnumber");

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            var service = factory.CreateOrganizationService(context.UserId);
            var trace = (ITracingService)provider.GetService(typeof(ITracingService));
            try
            {
                if (context.UserId != context.InitiatingUserId)
                    throw new InvalidPluginExecutionException("Mailbox processing cannot impersonate another operational owner.");
                VerificationApi.RequireRole(factory.CreateOrganizationService(null),
                    context.InitiatingUserId, "MTC Processor", false);
                var mailboxId = GuidInput(context, "MailboxRecordId");
                var mailbox = service.Retrieve("mtc_mailboxenrollment", mailboxId, MailboxColumns);
                switch (context.MessageName)
                {
                    case "mtc_BeginMailboxPoll": Begin(context, service, mailbox); break;
                    case "mtc_ProcessMessageBatch": ProcessBatch(context, service, mailbox); break;
                    case "mtc_CompleteMailboxPage": CompletePage(context, service, mailbox); break;
                    case "mtc_ReportMailboxFailure": Failure(context, service, mailbox); break;
                    default: throw new InvalidPluginExecutionException("Unsupported mailbox runtime operation.");
                }
            }
            catch (ArgumentException error)
            {
                trace.Trace("MTC runtime validation rejected: {0}", error.Message);
                throw new InvalidPluginExecutionException(error.Message);
            }
        }

        private static Guid GuidInput(IPluginExecutionContext context, string name)
        {
            if (!context.InputParameters.Contains(name) || !(context.InputParameters[name] is Guid) ||
                (Guid)context.InputParameters[name] == Guid.Empty)
                throw new ArgumentException(name + " must be a nonempty identifier.");
            return (Guid)context.InputParameters[name];
        }

        internal static string Setting(IOrganizationService service, string name)
        {
            var query = new QueryExpression("environmentvariabledefinition")
            {
                ColumnSet = new ColumnSet("defaultvalue"), TopCount = 2
            };
            query.Criteria.AddCondition("schemaname", ConditionOperator.Equal, name);
            var definitions = service.RetrieveMultiple(query).Entities;
            if (definitions.Count != 1) throw new InvalidPluginExecutionException("Missing or ambiguous runtime setting: " + name);
            var values = new QueryExpression("environmentvariablevalue") { ColumnSet = new ColumnSet("value"), TopCount = 2 };
            values.Criteria.AddCondition("environmentvariabledefinitionid", ConditionOperator.Equal, definitions[0].Id);
            values.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
            var current = service.RetrieveMultiple(values).Entities;
            if (current.Count > 1) throw new InvalidPluginExecutionException("Ambiguous current runtime setting: " + name);
            return current.Count == 1 ? current[0].GetAttributeValue<string>("value") : definitions[0].GetAttributeValue<string>("defaultvalue");
        }

        private static string Mode(IOrganizationService service)
        {
            var mode = Setting(service, "mtc_ProcessingMode");
            if (mode != "Disabled" && mode != "Shadow" && mode != "Label")
                throw new InvalidPluginExecutionException("Invalid processing mode. Missing configuration does not authorize processing.");
            if (mode == "Label")
                throw new InvalidPluginExecutionException("Visible labels are not authorized by this shadow runtime release.");
            return mode;
        }

        private static string Utc(DateTime time) => DateTime.SpecifyKind(time, DateTimeKind.Utc)
            .ToString("yyyy-MM-ddTHH:mm:ssZ", CultureInfo.InvariantCulture);

        private static bool Enrolled(Entity mailbox) =>
            mailbox.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0 &&
            mailbox.GetAttributeValue<OptionSetValue>("mtc_enrollmentstatus")?.Value == 100000001;

        private static void Lease(IPluginExecutionContext context, IOrganizationService service, Entity mailbox)
        {
            if (Mode(service) != "Shadow" || !Enrolled(mailbox))
                throw new InvalidPluginExecutionException("The mailbox is paused or shadow processing is disabled.");
            var lease = GuidInput(context, "LeaseId").ToString("D");
            if (mailbox.GetAttributeValue<string>("mtc_leaseid") != lease ||
                mailbox.GetAttributeValue<DateTime>("mtc_leaseexpireson") <= DateTime.UtcNow)
                throw new InvalidPluginExecutionException("The mailbox poll lease expired or belongs to another run; checkpoint was not advanced.");
        }

        private static DateTime? NextExpiry(IOrganizationService service, DateTime now)
        {
            DateTime? earliest = null;
            foreach (var table in new[] { "mtc_approvedcontact", "mtc_approveddomain", "mtc_businessparty" })
            {
                var query = new QueryExpression(table) { ColumnSet = new ColumnSet("mtc_expireson"), TopCount = 1 };
                query.Criteria.AddCondition("statecode", ConditionOperator.Equal, 0);
                query.Criteria.AddCondition("mtc_verificationstatus", ConditionOperator.Equal, 100000001);
                query.Criteria.AddCondition("mtc_expireson", ConditionOperator.GreaterThan, now);
                query.AddOrder("mtc_expireson", OrderType.Ascending);
                var result = service.RetrieveMultiple(query).Entities;
                if (result.Count == 1)
                {
                    var expiry = result[0].GetAttributeValue<DateTime>("mtc_expireson");
                    if (!earliest.HasValue || expiry < earliest.Value) earliest = expiry;
                }
            }
            return earliest;
        }

        private static DateTime LastRegistryEvent(IOrganizationService service)
        {
            var query = new QueryExpression("mtc_verificationcase") { ColumnSet = new ColumnSet("mtc_reviewedon"), TopCount = 1 };
            query.Criteria.AddCondition("mtc_reviewedon", ConditionOperator.NotNull);
            query.AddOrder("mtc_reviewedon", OrderType.Descending);
            var rows = service.RetrieveMultiple(query).Entities;
            return rows.Count == 1 ? rows[0].GetAttributeValue<DateTime>("mtc_reviewedon") : DateTime.MinValue;
        }

        private static void Begin(IPluginExecutionContext context, IOrganizationService service, Entity mailbox)
        {
            context.OutputParameters["Enabled"] = false;
            context.OutputParameters["MailboxReference"] = mailbox.GetAttributeValue<string>("mtc_mailboxreference") ?? "";
            context.OutputParameters["NextPageUrl"] = "";
            context.OutputParameters["ScanFrom"] = DateTime.UtcNow;
            context.OutputParameters["ScanUntil"] = DateTime.UtcNow;
            context.OutputParameters["LeaseId"] = Guid.Empty;
            if (Mode(service) == "Disabled" || !Enrolled(mailbox)) return;
            var clock = DateTime.UtcNow;
            var now = new DateTime(clock.Ticks - clock.Ticks % TimeSpan.TicksPerSecond, DateTimeKind.Utc);
            if (mailbox.GetAttributeValue<DateTime>("mtc_leaseexpireson") > now)
                throw new InvalidPluginExecutionException("A mailbox poll is already leased by another run.");
            var excluded = mailbox.GetAttributeValue<string>("mtc_excludedfolderids");
            if (string.IsNullOrEmpty(excluded) || excluded.Split('\n').Length != 4)
                throw new InvalidPluginExecutionException("The four outbound/deleted folder exclusions must be configured before processing.");
            var nextPage = mailbox.GetAttributeValue<string>("mtc_nextpageurl");
            var scanUntil = mailbox.GetAttributeValue<DateTime>("mtc_scanuntil");
            var scanFrom = mailbox.GetAttributeValue<DateTime>("mtc_scanfrom");
            if (string.IsNullOrEmpty(nextPage))
            {
                scanUntil = now;
                var checkpoint = mailbox.GetAttributeValue<string>("mtc_checkpoint");
                var lastRegistryScan = mailbox.GetAttributeValue<DateTime>("mtc_registrycheckedon");
                var expiryDue = mailbox.GetAttributeValue<DateTime?>("mtc_reassessmentdueon");
                var reassess = LastRegistryEvent(service) > lastRegistryScan ||
                    (expiryDue.HasValue && expiryDue.Value <= now);
                if (string.IsNullOrEmpty(checkpoint) || reassess) scanFrom = now.AddDays(-30);
                else if (!DateTime.TryParse(checkpoint, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out scanFrom))
                    throw new InvalidPluginExecutionException("Invalid mailbox checkpoint; no implicit reset performed.");
                else scanFrom = scanFrom.AddMinutes(-10);
            }
            if (scanFrom >= scanUntil || scanFrom < now.AddDays(-31))
                throw new InvalidPluginExecutionException("Mailbox scan window is invalid or exceeds the approved 30-day history plus overlap.");
            var lease = Guid.NewGuid();
            var update = new Entity("mtc_mailboxenrollment", mailbox.Id)
            {
                RowVersion = mailbox.RowVersion ??
                    mailbox.GetAttributeValue<long>("versionnumber").ToString(CultureInfo.InvariantCulture),
                ["mtc_lastattempton"] = now,
                ["mtc_leaseid"] = lease.ToString("D"),
                ["mtc_leaseexpireson"] = now.AddMinutes(30),
                ["mtc_scanfrom"] = scanFrom,
                ["mtc_scanuntil"] = scanUntil
            };
            service.Execute(new UpdateRequest { Target = update, ConcurrencyBehavior = ConcurrencyBehavior.IfRowVersionMatches });
            context.OutputParameters["Enabled"] = true;
            context.OutputParameters["NextPageUrl"] = nextPage ?? "";
            context.OutputParameters["ScanFrom"] = scanFrom;
            context.OutputParameters["ScanUntil"] = scanUntil;
            context.OutputParameters["LeaseId"] = lease;
        }

        private static bool Verified(Entity row, DateTime now)
        {
            return row.GetAttributeValue<OptionSetValue>("statecode")?.Value == 0 &&
                row.GetAttributeValue<OptionSetValue>("mtc_verificationstatus")?.Value == 100000001 &&
                row.GetAttributeValue<DateTime>("mtc_verifiedon") <= now &&
                row.GetAttributeValue<DateTime>("mtc_verifiedon") > DateTime.MinValue &&
                row.GetAttributeValue<DateTime>("mtc_expireson") > now &&
                !string.IsNullOrWhiteSpace(row.GetAttributeValue<string>("mtc_evidencereference")) &&
                !string.IsNullOrWhiteSpace(row.GetAttributeValue<string>("mtc_verificationmethod")) &&
                row.GetAttributeValue<EntityReference>("mtc_independentreviewer") != null;
        }

        internal static RegistryMatch Match(IOrganizationService service, string address, DateTime now)
        {
            var domain = address.Substring(address.LastIndexOf('@') + 1);
            var contact = FindIdentity(service, "mtc_approvedcontact", "mtc_emailaddress", address);
            Entity matched;
            var domainReason = "MTC_EXACT_DOMAIN_MATCH";
            var contactMatch = contact.Count == 1;
            if (contact.Count > 1) return new RegistryMatch { Reason = "MTC_DUPLICATE_CONTACT" };
            if (contactMatch)
            {
                matched = contact[0];
                if (!string.Equals(matched.GetAttributeValue<string>("mtc_emailaddress"), address, StringComparison.Ordinal))
                    return new RegistryMatch { Reason = "MTC_CONTACT_CASE_CONFLICT" };
            }
            else
            {
                if (VerificationPolicy.IsConsumerDomain(domain)) return new RegistryMatch { Reason = "MTC_EXACT_CONSUMER_CONTACT_REQUIRED" };
                // The most specific existing entry decides: exact domain first, then the nearest wildcard,
                // so a revoked narrower entry is never overridden by a broader approval.
                var wildcard = false;
                var domains = FindIdentity(service, "mtc_approveddomain", "mtc_domain", domain);
                if (domains.Count == 0)
                {
                    var labels = domain.Split('.');
                    for (var start = 0; start <= labels.Length - 2 && domains.Count == 0; start++)
                        domains = FindIdentity(service, "mtc_approveddomain", "mtc_domain",
                            "*." + string.Join(".", labels, start, labels.Length - start));
                    wildcard = domains.Count > 0;
                }
                if (domains.Count != 1) return new RegistryMatch { Reason = domains.Count == 0 ? "MTC_REGISTRY_NO_MATCH" : "MTC_DUPLICATE_DOMAIN" };
                matched = domains[0];
                domainReason = wildcard ? "MTC_WILDCARD_DOMAIN_MATCH" : "MTC_EXACT_DOMAIN_MATCH";
            }
            if (!Verified(matched, now)) return new RegistryMatch { Reason = "MTC_MATCH_NOT_ACTIVE_OR_EVIDENCED" };
            var partyRef = matched.GetAttributeValue<EntityReference>("mtc_businessparty");
            if (partyRef == null) return new RegistryMatch { Reason = "MTC_PARTY_MISSING" };
            var party = service.Retrieve("mtc_businessparty", partyRef.Id, new ColumnSet(
                "statecode", "mtc_verificationstatus", "mtc_verifiedon", "mtc_expireson",
                "mtc_verificationmethod", "mtc_evidencereference", "mtc_independentreviewer", "mtc_verificationcase"));
            if (!Verified(party, now) || party.GetAttributeValue<EntityReference>("mtc_verificationcase") == null)
                return new RegistryMatch { Reason = "MTC_PARTY_NOT_ACTIVE_OR_EVIDENCED" };
            return new RegistryMatch
            {
                Approved = true, Contact = contactMatch,
                ExpiresOn = new[] { party.GetAttributeValue<DateTime>("mtc_expireson"), matched.GetAttributeValue<DateTime>("mtc_expireson") }.Min(),
                Reason = contactMatch ? "MTC_EXACT_CONTACT_MATCH" : domainReason
            };
        }

        private static IList<Entity> FindIdentity(IOrganizationService service, string table, string column, string target)
        {
            var query = new QueryExpression(table) { ColumnSet = new ColumnSet(
                column, "statecode", "mtc_verificationstatus", "mtc_verifiedon", "mtc_expireson",
                "mtc_verificationmethod", "mtc_evidencereference", "mtc_independentreviewer", "mtc_businessparty"), TopCount = 2 };
            query.Criteria.AddCondition(column, ConditionOperator.Equal, target);
            return service.RetrieveMultiple(query).Entities;
        }

        private static void ProcessBatch(IPluginExecutionContext context, IOrganizationService service, Entity mailbox)
        {
            Lease(context, service, mailbox);
            if (!context.InputParameters.Contains("ImmutableIdsApplied") ||
                !Equals(context.InputParameters["ImmutableIdsApplied"], true))
                throw new ArgumentException("Graph did not confirm immutable message IDs; no assessments were written.");
            var json = context.InputParameters["MessagesJson"] as string;
            if (json == null || json.Length > 2000000)
                throw new ArgumentException("Message metadata batch is missing or exceeds the supported size.");
            GraphMessage[] messages;
            using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                messages = (GraphMessage[])new DataContractJsonSerializer(typeof(GraphMessage[])).ReadObject(stream);
            if (messages == null || messages.Length > 50)
                throw new ArgumentException("A metadata batch must contain at most 50 messages.");
            var excluded = new HashSet<string>((mailbox.GetAttributeValue<string>("mtc_excludedfolderids") ?? "").Split('\n'), StringComparer.Ordinal);
            var mailboxRef = mailbox.GetAttributeValue<string>("mtc_mailboxreference");
            var seen = new HashSet<string>(StringComparer.Ordinal);
            var processed = 0;
            var known = 0;
            foreach (var message in messages)
            {
                if (message == null || string.IsNullOrEmpty(message.Id) || message.Id.Length > 1000 ||
                    !seen.Add(message.Id) || string.IsNullOrEmpty(message.ParentFolderId))
                    throw new ArgumentException("Missing, duplicate, or invalid immutable message metadata.");
                if (excluded.Contains(message.ParentFolderId)) continue;
                DateTime received;
                if (!DateTime.TryParse(message.ReceivedDateTime, CultureInfo.InvariantCulture,
                    DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out received))
                    throw new ArgumentException("Message received timestamp is invalid.");
                if (received < mailbox.GetAttributeValue<DateTime>("mtc_scanfrom") ||
                    received >= mailbox.GetAttributeValue<DateTime>("mtc_scanuntil"))
                    throw new ArgumentException("Graph returned a message outside the fixed poll window.");
                var from = message.From?.EmailAddress?.Address;
                RegistryMatch registry;
                string address = null;
                try { address = VerificationPolicy.Target("contact", from); }
                catch (ArgumentException) { }
                registry = address == null ? new RegistryMatch { Reason = "MTC_INVALID_FROM" } : Match(service, address, DateTime.UtcNow);
                var decision = MessagePolicy.Assess(from, message.Sender?.EmailAddress?.Address,
                    message.ReplyTo?.Select(value => value?.EmailAddress?.Address).ToArray(),
                    message.Headers?.Select(header => new ReceivingHeader { Name = header.Name, Value = header.Value }).ToArray(),
                    registry.Approved);
                var id = AssessmentIdentity.ForMessage(context.OrganizationId, mailboxRef, message.Id);
                var existing = new QueryExpression("mtc_messageassessment")
                {
                    ColumnSet = new ColumnSet("mtc_stablemessageid", "mtc_mailboxreference"), TopCount = 2
                };
                existing.Criteria.AddCondition("mtc_messageassessmentid", ConditionOperator.Equal, id);
                var assessments = service.RetrieveMultiple(existing).Entities;
                if (assessments.Count > 1 || (assessments.Count == 1 &&
                    (!string.Equals(assessments[0].GetAttributeValue<string>("mtc_stablemessageid"), message.Id, StringComparison.Ordinal) ||
                    !string.Equals(assessments[0].GetAttributeValue<string>("mtc_mailboxreference"), mailboxRef, StringComparison.OrdinalIgnoreCase))))
                    throw new InvalidPluginExecutionException("The deterministic assessment identity conflicts with the exact mailbox/message key.");
                if (assessments.Count == 0)
                {
                    var legacy = new QueryExpression("mtc_messageassessment")
                    {
                        ColumnSet = new ColumnSet("mtc_stablemessageid", "mtc_mailboxreference"), TopCount = 100
                    };
                    legacy.Criteria.AddCondition("mtc_mailboxreference", ConditionOperator.Equal, mailboxRef);
                    legacy.Criteria.AddCondition("mtc_stablemessageid", ConditionOperator.Equal, message.Id);
                    var candidates = service.RetrieveMultiple(legacy).Entities;
                    if (candidates.Count == 100)
                        throw new InvalidPluginExecutionException("Legacy assessment lookup exceeded the supported ambiguity bound.");
                    var exact = AssessmentIdentity.ExactLegacy(candidates, mailboxRef, message.Id);
                    if (exact.Length > 1) throw new InvalidPluginExecutionException("Duplicate exact legacy message assessments exist.");
                    if (exact.Length == 1)
                    {
                        id = exact[0].Id;
                        assessments.Add(exact[0]);
                    }
                }
                var row = new Entity("mtc_messageassessment", id)
                {
                    ["mtc_name"] = (decision.Known ? "Shadow known " : "Shadow not known ") + message.Id.Substring(0, Math.Min(24, message.Id.Length)),
                    ["mtc_mailboxreference"] = mailboxRef,
                    ["mtc_stablemessageid"] = message.Id,
                    ["mtc_receivedon"] = received,
                    ["mtc_assessedon"] = DateTime.UtcNow,
                    ["mtc_senderaddress"] = address,
                    ["mtc_senderdomain"] = address?.Substring(address.LastIndexOf('@') + 1),
                    ["mtc_decision"] = new OptionSetValue(decision.Known ? 100000001 : 100000000),
                    ["mtc_relationshipstate"] = new OptionSetValue(registry.Approved ? (registry.Contact ? 100000003 : 100000002) : 100000001),
                    ["mtc_authenticationstate"] = new OptionSetValue(decision.AuthenticationAligned ? 100000001 : 100000002),
                    ["mtc_riskstate"] = new OptionSetValue(100000000),
                    ["mtc_processingstatus"] = new OptionSetValue(100000001),
                    ["mtc_presentationstatus"] = new OptionSetValue(100000000),
                    ["mtc_ruleversion"] = "message-runtime-shadow-2",
                    ["mtc_registryversion"] = "caller-stamped-registry-1",
                    ["mtc_registrycheckedon"] = DateTime.UtcNow,
                    ["mtc_eligibilityexpireson"] = registry.ExpiresOn,
                    ["mtc_reasoncodes"] = decision.Reason + ";" + registry.Reason + ";MTC_SHADOW_NO_PRESENTATION"
                };
                if (assessments.Count == 1) service.Update(row);
                else service.Execute(new UpsertRequest { Target = row });
                processed++;
                if (decision.Known) known++;
            }
            service.Update(new Entity("mtc_mailboxenrollment", mailbox.Id)
            {
                ["mtc_leaseexpireson"] = DateTime.UtcNow.AddMinutes(30)
            });
            context.OutputParameters["ProcessedCount"] = processed;
            context.OutputParameters["KnownCandidateCount"] = known;
        }

        private static void CompletePage(IPluginExecutionContext context, IOrganizationService service, Entity mailbox)
        {
            Lease(context, service, mailbox);
            var next = context.InputParameters["NextPageUrl"] as string;
            if (next == null || next.Length > 4000) throw new ArgumentException("A bounded next-page URL or empty final cursor is required.");
            if (next.Length > 0)
            {
                Uri url;
                if (!Uri.TryCreate(next, UriKind.Absolute, out url) || url.Scheme != "https" || !url.IsDefaultPort ||
                    url.Host != "graph.microsoft.com" || !string.IsNullOrEmpty(url.UserInfo) || !string.IsNullOrEmpty(url.Fragment) ||
                    !string.Equals(Uri.UnescapeDataString(url.AbsolutePath),
                        "/v1.0/users/" + mailbox.GetAttributeValue<string>("mtc_mailboxreference") + "/messages", StringComparison.OrdinalIgnoreCase))
                    throw new ArgumentException("Graph cursor must stay on this mailbox metadata collection.");
            }
            var update = new Entity("mtc_mailboxenrollment", mailbox.Id)
            {
                ["mtc_nextpageurl"] = next,
                ["mtc_leaseexpireson"] = DateTime.UtcNow.AddMinutes(30)
            };
            if (next.Length == 0)
            {
                update["mtc_checkpoint"] = Utc(mailbox.GetAttributeValue<DateTime>("mtc_scanuntil"));
                update["mtc_registrycheckedon"] = mailbox.GetAttributeValue<DateTime>("mtc_scanuntil");
                update["mtc_lastsuccessfulpollon"] = DateTime.UtcNow;
                update["mtc_healthstate"] = new OptionSetValue(100000001);
                update["mtc_lasterror"] = "";
                update["mtc_leaseid"] = null;
                update["mtc_leaseexpireson"] = null;
                update["mtc_reassessmentdueon"] = NextExpiry(service, DateTime.UtcNow);
            }
            service.Update(update);
        }

        private static void Failure(IPluginExecutionContext context, IOrganizationService service, Entity mailbox)
        {
            var reason = VerificationPolicy.Text(context.InputParameters["Reason"] as string, "Failure reason", 1500);
            var ownedLease = context.InputParameters.Contains("LeaseId") &&
                context.InputParameters["LeaseId"] is Guid &&
                mailbox.GetAttributeValue<string>("mtc_leaseid") == ((Guid)context.InputParameters["LeaseId"]).ToString("D");
            if (!ownedLease && mailbox.GetAttributeValue<DateTime>("mtc_leaseexpireson") > DateTime.UtcNow)
                throw new InvalidPluginExecutionException("Failure reporting cannot cancel another active mailbox poll lease.");
            var now = DateTime.UtcNow;
            var previous = mailbox.GetAttributeValue<DateTime>("mtc_lastalerton");
            if (previous < now.AddHours(-1))
            {
                var destination = Setting(service, "mtc_OperatorAlertDestination");
                Guid recipient;
                if (destination == null || !destination.StartsWith("user:", StringComparison.Ordinal) ||
                    !Guid.TryParse(destination.Substring(5), out recipient))
                    throw new InvalidPluginExecutionException("In-app operator alert recipient is not configured; failure notification could not be delivered.");
                service.Execute(new OrganizationRequest("SendAppNotification")
                {
                    ["Title"] = "Sender Registry processing needs attention",
                    ["Recipient"] = new EntityReference("systemuser", recipient),
                    ["Body"] = "Mailbox: " + mailbox.GetAttributeValue<string>("mtc_mailboxreference") +
                        ". Processing failed and the delivery checkpoint was not advanced. " + reason,
                    ["IconType"] = new OptionSetValue(100000003),
                    ["ToastType"] = new OptionSetValue(200000000)
                });
            }
            service.Update(new Entity("mtc_mailboxenrollment", mailbox.Id)
            {
                ["mtc_healthstate"] = new OptionSetValue(100000003),
                ["mtc_lasterror"] = reason,
                ["mtc_lastalerton"] = previous < now.AddHours(-1) ? now : previous,
                ["mtc_leaseid"] = null,
                ["mtc_leaseexpireson"] = null
            });
        }

        internal sealed class RegistryMatch
        {
            public bool Approved, Contact;
            public DateTime? ExpiresOn;
            public string Reason;
        }
    }

    [DataContract] public sealed class GraphMessage
    {
        [DataMember(Name = "id")] public string Id { get; set; }
        [DataMember(Name = "parentFolderId")] public string ParentFolderId { get; set; }
        [DataMember(Name = "receivedDateTime")] public string ReceivedDateTime { get; set; }
        [DataMember(Name = "from")] public GraphParty From { get; set; }
        [DataMember(Name = "sender")] public GraphParty Sender { get; set; }
        [DataMember(Name = "replyTo")] public GraphParty[] ReplyTo { get; set; }
        [DataMember(Name = "internetMessageHeaders")] public GraphHeader[] Headers { get; set; }
        [DataMember(Name = "categories")] public string[] Categories { get; set; }
        [DataMember(Name = "@odata.etag")] public string ETag { get; set; }
    }
    [DataContract] public sealed class GraphParty
    {
        [DataMember(Name = "emailAddress")] public GraphAddress EmailAddress { get; set; }
    }
    [DataContract] public sealed class GraphAddress
    {
        [DataMember(Name = "address")] public string Address { get; set; }
    }
    [DataContract] public sealed class GraphHeader
    {
        [DataMember(Name = "name")] public string Name { get; set; }
        [DataMember(Name = "value")] public string Value { get; set; }
    }
}
