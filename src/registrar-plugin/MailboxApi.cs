using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Mtc.Registrar
{
    public sealed class MailboxApi : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var trace = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            try
            {
                if ((context.MessageName != "mtc_SetMailboxEnrollment" && context.MessageName != "mtc_SetMailboxFolderScope") ||
                    context.UserId != context.InitiatingUserId)
                    throw new InvalidPluginExecutionException("Mailbox enrollment must execute as the actual authorized operator.");
                VerificationApi.RequireRole(factory.CreateOrganizationService(null), context.InitiatingUserId, "MTC Operator");
                var service = factory.CreateOrganizationService(context.UserId);
                VerificationApi.RequireIdentityKey(service, "mtc_mailboxenrollment", "mtc_mailboxidentity");
                if (context.MessageName == "mtc_SetMailboxFolderScope")
                {
                    if (!(context.InputParameters["MailboxRecordId"] is Guid) ||
                        (Guid)context.InputParameters["MailboxRecordId"] == Guid.Empty)
                        throw new ArgumentException("A mailbox enrollment record is required.");
                    var folders = VerificationPolicy.Text(context.InputParameters["FolderIds"] as string, "Folder exclusions", 4000);
                    var ids = folders.Split('\n');
                    // The four outbound/deleted folders plus any Recoverable Items folders (Deletions, Purges, Versions...).
                    if (ids.Length < 4 || ids.Length > 16 || ids.Any(id => string.IsNullOrWhiteSpace(id) || id != id.Trim()) ||
                        ids.Distinct(StringComparer.Ordinal).Count() != ids.Length)
                        throw new ArgumentException("Between four and sixteen distinct excluded folder identifiers are required.");
                    service.Update(new Entity("mtc_mailboxenrollment", (Guid)context.InputParameters["MailboxRecordId"])
                    {
                        ["mtc_excludedfolderids"] = folders
                    });
                    return;
                }
                var address = VerificationPolicy.Target("contact", context.InputParameters["MailboxReference"] as string);
                var type = context.InputParameters["MailboxType"] as string;
                if (type != "User" && type != "Shared")
                    throw new ArgumentException("Only User and Shared mailbox types are supported.");
                if (!(context.InputParameters["Enrolled"] is bool))
                    throw new ArgumentException("An explicit enrolled or paused choice is required.");
                var enrolled = (bool)context.InputParameters["Enrolled"];
                var query = new QueryExpression("mtc_mailboxenrollment")
                {
                    ColumnSet = new ColumnSet("mtc_mailboxreference", "mtc_mailboxtype"), TopCount = 2
                };
                query.Criteria.AddCondition("mtc_mailboxreference", ConditionOperator.Equal, address);
                var matches = service.RetrieveMultiple(query).Entities;
                if (matches.Count > 1) throw new InvalidPluginExecutionException("Duplicate mailbox enrollment records exist. Resolve them before changing coverage.");
                var existing = matches.SingleOrDefault();
                var mailbox = new Entity("mtc_mailboxenrollment", existing?.Id ?? Guid.NewGuid())
                {
                    ["mtc_name"] = address.Length > 200 ? address.Substring(0, 200) : address,
                    ["mtc_mailboxreference"] = address,
                    ["mtc_mailboxtype"] = new OptionSetValue(type == "User" ? 100000000 : 100000001),
                    ["mtc_enrollmentstatus"] = new OptionSetValue(enrolled ? 100000001 : 100000000)
                };
                if (existing == null)
                {
                    mailbox["mtc_healthstate"] = new OptionSetValue(100000000);
                    service.Create(mailbox);
                }
                else service.Update(mailbox);
                context.OutputParameters["RecordId"] = mailbox.Id;
            }
            catch (ArgumentException error)
            {
                trace.Trace("MTC mailbox enrollment validation rejected: {0}", error.Message);
                throw new InvalidPluginExecutionException(error.Message);
            }
        }
    }
}
