using System;
using System.IO;
using System.Linq;
using System.Runtime.Serialization;
using System.Runtime.Serialization.Json;
using System.Text;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Mtc.Registrar
{
    public sealed class LabelRuntime : IPlugin
    {
        private static readonly string[] OwnedCategories = {
            "MTC Proof - known sender", "MTC Proof - not known",
            "MTC - known sender", "MTC - not known"
        };

        public void Execute(IServiceProvider provider)
        {
            var context = (IPluginExecutionContext)provider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)provider.GetService(typeof(IOrganizationServiceFactory));
            if (context.UserId != context.InitiatingUserId)
                throw new InvalidPluginExecutionException("Presentation cannot impersonate another operational owner.");
            VerificationApi.RequireRole(factory.CreateOrganizationService(null), context.InitiatingUserId, "MTC Processor", false);
            var service = factory.CreateOrganizationService(context.UserId);
            if (context.MessageName == "mtc_IsLabelingEnabled")
            {
                var setting = MailboxRuntime.Setting(service, "mtc_LabelingMode");
                if (setting != "Disabled" && setting != "Pilot" && setting != "Production")
                    throw new InvalidPluginExecutionException("Invalid labeling mode; missing configuration cannot authorize visible categories.");
                context.OutputParameters["Enabled"] = setting == "Pilot" || setting == "Production";
                return;
            }
            if (!(context.InputParameters["AssessmentId"] is Guid) ||
                (Guid)context.InputParameters["AssessmentId"] == Guid.Empty)
                throw new InvalidPluginExecutionException("An exact assessment record is required.");
            var assessment = service.Retrieve("mtc_messageassessment", (Guid)context.InputParameters["AssessmentId"],
                new ColumnSet("mtc_mailboxreference", "mtc_stablemessageid", "mtc_receivedon"));
            if (assessment.GetAttributeValue<DateTime>("mtc_receivedon") < DateTime.UtcNow.AddDays(-30))
                throw new InvalidPluginExecutionException("The assessment is outside the approved retained-message presentation window.");
            var enrollment = new QueryExpression("mtc_mailboxenrollment")
            {
                ColumnSet = new ColumnSet("mtc_enrollmentstatus", "statecode", "mtc_excludedfolderids"), TopCount = 2
            };
            enrollment.Criteria.AddCondition("mtc_mailboxreference", ConditionOperator.Equal,
                assessment.GetAttributeValue<string>("mtc_mailboxreference"));
            var mailboxes = service.RetrieveMultiple(enrollment).Entities;
            if (context.MessageName == "mtc_ReportPresentationFailure")
            {
                var reason = VerificationPolicy.Text(context.InputParameters["Reason"] as string, "Presentation failure reason", 1500);
                service.Update(new Entity("mtc_messageassessment", assessment.Id)
                {
                    ["mtc_presentationstatus"] = new OptionSetValue(100000002)
                });
                if (mailboxes.Count != 1) throw new InvalidPluginExecutionException("Presentation failure mailbox is ambiguous.");
                var mailbox = service.Retrieve("mtc_mailboxenrollment", mailboxes[0].Id, new ColumnSet("mtc_lastalerton"));
                if (mailbox.GetAttributeValue<DateTime>("mtc_lastalerton") < DateTime.UtcNow.AddHours(-1))
                {
                    var destination = MailboxRuntime.Setting(service, "mtc_OperatorAlertDestination");
                    Guid recipient;
                    if (destination == null || !destination.StartsWith("user:", StringComparison.Ordinal) ||
                        !Guid.TryParse(destination.Substring(5), out recipient))
                        throw new InvalidPluginExecutionException("Presentation failure notification recipient is not configured.");
                    service.Execute(new OrganizationRequest("SendAppNotification")
                    {
                        ["Title"] = "Sender Registry processing needs attention",
                        ["Recipient"] = new EntityReference("systemuser", recipient),
                        ["Body"] = "Outlook category reconciliation failed for " +
                            assessment.GetAttributeValue<string>("mtc_mailboxreference") + ". " + reason,
                        ["IconType"] = new OptionSetValue(100000003),
                        ["ToastType"] = new OptionSetValue(200000000)
                    });
                    service.Update(new Entity("mtc_mailboxenrollment", mailbox.Id) { ["mtc_lastalerton"] = DateTime.UtcNow });
                }
                return;
            }
            var mode = MailboxRuntime.Setting(service, "mtc_LabelingMode");
            if (mode != "Pilot" && mode != "Production")
                throw new InvalidPluginExecutionException("Visible Outlook labels are disabled or not explicitly authorized.");
            if (mailboxes.Count != 1 || mailboxes[0].GetAttributeValue<OptionSetValue>("statecode")?.Value != 0 ||
                mailboxes[0].GetAttributeValue<OptionSetValue>("mtc_enrollmentstatus")?.Value != 100000001)
                throw new InvalidPluginExecutionException("The presentation mailbox is paused, inactive, or ambiguous.");
            var json = context.InputParameters["MessageJson"] as string;
            if (json == null || json.Length > 2000000)
                throw new InvalidPluginExecutionException("Bounded current message metadata is required.");
            GraphMessage message;
            using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
                message = (GraphMessage)new DataContractJsonSerializer(typeof(GraphMessage)).ReadObject(stream);
            if (message == null || !string.Equals(message.Id,
                assessment.GetAttributeValue<string>("mtc_stablemessageid"), StringComparison.Ordinal) ||
                string.IsNullOrWhiteSpace(message.ETag) || message.Categories == null ||
                message.Categories.Any(category => category == null))
                throw new InvalidPluginExecutionException("Exact immutable identity, current ETag, and category metadata are required.");
            if ((mailboxes[0].GetAttributeValue<string>("mtc_excludedfolderids") ?? "").Split('\n')
                .Contains(message.ParentFolderId, StringComparer.Ordinal))
                throw new InvalidPluginExecutionException("The retained message moved outside the approved delivered-mail folder scope.");
            if (context.MessageName == "mtc_VerifyMessagePresentation")
            {
                var expected = context.InputParameters["ExpectedCategoriesJson"] as string;
                string[] categories;
                using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(expected ?? "")))
                    categories = (string[])new DataContractJsonSerializer(typeof(string[])).ReadObject(stream);
                if (categories == null || !categories.OrderBy(value => value, StringComparer.Ordinal)
                    .SequenceEqual(message.Categories.OrderBy(value => value, StringComparer.Ordinal), StringComparer.Ordinal))
                    throw new InvalidPluginExecutionException("Outlook category readback did not match the exact planned category set.");
                string address = null;
                try { address = VerificationPolicy.Target("contact", message.From?.EmailAddress?.Address); }
                catch (ArgumentException) { }
                var currentRegistry = address == null ? null : MailboxRuntime.Match(service, address, DateTime.UtcNow);
                var currentDecision = MessagePolicy.Assess(message.From?.EmailAddress?.Address,
                    message.Sender?.EmailAddress?.Address,
                    message.ReplyTo?.Select(reply => reply?.EmailAddress?.Address).ToArray(),
                    message.Headers?.Select(header => new ReceivingHeader { Name = header.Name, Value = header.Value }).ToArray(),
                    currentRegistry?.Approved == true);
                var currentLabel = (mode == "Pilot" ? "MTC Proof - " : "MTC - ") +
                    (currentDecision.Known ? "known sender" : "not known");
                if (!message.Categories.Contains(currentLabel, StringComparer.Ordinal) ||
                    message.Categories.Any(category => OwnedCategories.Contains(category, StringComparer.Ordinal) && category != currentLabel))
                    throw new InvalidPluginExecutionException("Registry/authentication eligibility changed before readback. Presentation requires reassessment.");
                service.Update(new Entity("mtc_messageassessment", assessment.Id)
                {
                    ["mtc_presentationstatus"] = new OptionSetValue(100000001)
                });
                return;
            }
            if (context.MessageName != "mtc_GetMessageLabelPlan")
                throw new InvalidPluginExecutionException("Unsupported presentation operation.");
            var from = message.From?.EmailAddress?.Address;
            string canonical = null;
            try { canonical = VerificationPolicy.Target("contact", from); }
            catch (ArgumentException) { }
            var registry = canonical == null ? null : MailboxRuntime.Match(service, canonical, DateTime.UtcNow);
            var decision = MessagePolicy.Assess(from, message.Sender?.EmailAddress?.Address,
                message.ReplyTo?.Select(reply => reply?.EmailAddress?.Address).ToArray(),
                message.Headers?.Select(header => new ReceivingHeader { Name = header.Name, Value = header.Value }).ToArray(),
                registry?.Approved == true);
            var prefix = mode == "Pilot" ? "MTC Proof - " : "MTC - ";
            var label = prefix + (decision.Known ? "known sender" : "not known");
            var categoriesToApply = message.Categories.Where(category => !OwnedCategories.Contains(category, StringComparer.Ordinal))
                .Concat(new[] { label }).Distinct(StringComparer.Ordinal).ToArray();
            string plan;
            using (var stream = new MemoryStream())
            {
                new DataContractJsonSerializer(typeof(string[])).WriteObject(stream, categoriesToApply);
                plan = Encoding.UTF8.GetString(stream.ToArray());
            }
            service.Update(new Entity("mtc_messageassessment", assessment.Id)
            {
                ["mtc_decision"] = new OptionSetValue(decision.Known ? 100000001 : 100000000),
                ["mtc_authenticationstate"] = new OptionSetValue(decision.AuthenticationAligned ? 100000001 : 100000002),
                ["mtc_assessedon"] = DateTime.UtcNow,
                ["mtc_presentationstatus"] = new OptionSetValue(100000000),
                ["mtc_reasoncodes"] = decision.Reason + ";" + (registry?.Reason ?? "MTC_INVALID_FROM") + ";MTC_PRESENTATION_PLANNED"
            });
            context.OutputParameters["CategoriesJson"] = plan;
            context.OutputParameters["ETag"] = message.ETag;
            context.OutputParameters["NeedsWrite"] = !message.Categories.OrderBy(value => value, StringComparer.Ordinal)
                .SequenceEqual(categoriesToApply.OrderBy(value => value, StringComparer.Ordinal), StringComparer.Ordinal);
        }
    }
}
