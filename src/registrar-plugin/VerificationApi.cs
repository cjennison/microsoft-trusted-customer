using System;
using System.Linq;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Mtc.Registrar
{
    public sealed class VerificationApi : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
            var trace = (ITracingService)serviceProvider.GetService(typeof(ITracingService));
            try
            {
                if (context.UserId != context.InitiatingUserId)
                    throw new InvalidPluginExecutionException("Verification must execute as the actual caller, not an impersonated service owner.");
                var service = factory.CreateOrganizationService(context.UserId);
                var authority = factory.CreateOrganizationService(null);
                RequireRole(authority, context.InitiatingUserId, "MTC Registrar");
                switch (context.MessageName)
                {
                    case "mtc_VerifySender": Verify(context, service, RegistrarRequirements.Load(authority)); break;
                    case "mtc_RevokeSender": Revoke(context, service); break;
                    default: throw new InvalidPluginExecutionException("Unsupported registry operation.");
                }
            }
            catch (ArgumentException error)
            {
                trace.Trace("MTC registry validation rejected: {0}", error.Message);
                throw new InvalidPluginExecutionException(error.Message);
            }
        }

        internal static void RequireRole(IOrganizationService service, Guid userId, string roleName, bool interactive = true)
        {
            var user = service.Retrieve("systemuser", userId, new ColumnSet("isdisabled", "applicationid"));
            if (user.GetAttributeValue<bool>("isdisabled") ||
                (interactive && user.GetAttributeValue<Guid>("applicationid") != Guid.Empty))
                throw new InvalidPluginExecutionException("An enabled interactive operator is required.");
            var roles = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), TopCount = 1 };
            roles.Criteria.AddCondition("name", ConditionOperator.Equal, roleName);
            var membership = roles.AddLink("systemuserroles", "roleid", "roleid");
            membership.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            if (service.RetrieveMultiple(roles).Entities.Count == 1) return;
            var teams = new QueryExpression("role") { ColumnSet = new ColumnSet("roleid"), TopCount = 1 };
            teams.Criteria.AddCondition("name", ConditionOperator.Equal, roleName);
            var teamRole = teams.AddLink("teamroles", "roleid", "roleid");
            var teamMember = teamRole.AddLink("teammembership", "teamid", "teamid");
            teamMember.LinkCriteria.AddCondition("systemuserid", ConditionOperator.Equal, userId);
            if (service.RetrieveMultiple(teams).Entities.Count != 1)
                throw new InvalidPluginExecutionException("The actual caller is not an authorized " + roleName + ".");
        }

        internal static void RequireIdentityKey(IOrganizationService service, string table, string key)
        {
            var response = (RetrieveEntityKeyResponse)service.Execute(new RetrieveEntityKeyRequest
            {
                EntityLogicalName = table, LogicalName = key, RetrieveAsIfPublished = true
            });
            if (response.EntityKeyMetadata.EntityKeyIndexStatus != EntityKeyIndexStatus.Active)
                throw new InvalidPluginExecutionException("The unique identity index is not active. Ask the operator to finish schema provisioning.");
        }

        private static string Input(IPluginExecutionContext context, string name, int maximum)
        {
            return VerificationPolicy.Text(
                context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null,
                name, maximum);
        }

        private static string OptionalInput(IPluginExecutionContext context, string name, int maximum, bool required)
        {
            var value = context.InputParameters.Contains(name) ? context.InputParameters[name] as string : null;
            if (string.IsNullOrEmpty(value))
            {
                if (required) throw new ArgumentException(name + " is required by this organization's registrar settings.");
                return null;
            }
            return VerificationPolicy.Text(value, name, maximum);
        }

        // Dataverse supplies DateTime.MinValue for an omitted optional DateTime parameter, so that value means "not provided".
        private static DateTime? OptionalExpiry(IPluginExecutionContext context, DateTime now, bool required)
        {
            var value = context.InputParameters.Contains("ExpiresOn") ? context.InputParameters["ExpiresOn"] : null;
            if (value != null && !(value is DateTime))
                throw new ArgumentException("Verification expiry must be a date.");
            if (value == null || ((DateTime)value).Ticks == DateTime.MinValue.Ticks)
            {
                if (required) throw new ArgumentException("ExpiresOn is required by this organization's registrar settings.");
                return null;
            }
            return VerificationPolicy.Expiry((DateTime)value, now);
        }

        private static string EntityName(string type)
        {
            if (type == "contact") return "mtc_approvedcontact";
            if (type == "domain") return "mtc_approveddomain";
            throw new ArgumentException("Choose an exact email address or a business domain.");
        }

        private static Entity Stamp(string table, Guid id, string evidence, string method, DateTime? expiry,
            Guid actor, DateTime now)
        {
            return new Entity(table, id)
            {
                ["mtc_verificationstatus"] = new OptionSetValue(100000001),
                ["mtc_evidencereference"] = evidence,
                ["mtc_verificationmethod"] = method,
                ["mtc_verifiedon"] = now,
                ["mtc_expireson"] = expiry,
                ["mtc_independentreviewer"] = new EntityReference("systemuser", actor)
            };
        }

        private static string EventName(string value) => value.Length > 200 ? value.Substring(0, 200) : value;

        private static void Verify(IPluginExecutionContext context, IOrganizationService service, RegistrarRequirements requirements)
        {
            var now = DateTime.UtcNow;
            var expiry = OptionalExpiry(context, now, requirements.ExpiryRequired);
            var type = Input(context, "TargetType", 10);
            var target = VerificationPolicy.Target(type, Input(context, "TargetValue", 320));
            var business = Input(context, "BusinessName", 200);
            var evidence = OptionalInput(context, "EvidenceReference", 1000, requirements.EvidenceRequired);
            var method = OptionalInput(context, "VerificationMethod", 200, requirements.MethodRequired);
            var table = EntityName(type);
            RequireIdentityKey(service, table,
                type == "contact" ? "mtc_approvedcontactidentity" : "mtc_approveddomainidentity");
            var identityColumn = type == "contact" ? "mtc_emailaddress" : "mtc_domain";
            var query = new QueryExpression(table)
            {
                ColumnSet = new ColumnSet("mtc_businessparty", "statecode"), TopCount = 2
            };
            query.Criteria.AddCondition(identityColumn, ConditionOperator.Equal, target);
            var matches = service.RetrieveMultiple(query).Entities;
            if (matches.Count > 1)
                throw new InvalidPluginExecutionException("Duplicate registry entries exist for this identity. Resolve them before verification.");
            var existing = matches.SingleOrDefault();
            if (existing != null && existing.GetAttributeValue<OptionSetValue>("statecode")?.Value != 0)
                throw new InvalidPluginExecutionException("This registry entry is inactive. An operator must resolve it before verification.");

            var party = Stamp("mtc_businessparty", Guid.NewGuid(), evidence, method, expiry,
                context.InitiatingUserId, now);
            party["mtc_name"] = business;
            party["mtc_relationshiptype"] = "Business relationship";
            service.Create(party);

            var record = Stamp(table, existing?.Id ?? Guid.NewGuid(), evidence, method, expiry,
                context.InitiatingUserId, now);
            record["mtc_name"] = EventName(target);
            record[identityColumn] = target;
            record["mtc_businessparty"] = party.ToEntityReference();
            if (existing == null) service.Create(record);
            else service.Update(record);

            var verification = new Entity("mtc_verificationcase", Guid.NewGuid())
            {
                ["mtc_name"] = EventName((existing == null ? "Verified " : "Renewed ") + target),
                ["mtc_businessparty"] = party.ToEntityReference(),
                ["mtc_reviewstatus"] = new OptionSetValue(100000001),
                ["mtc_evidencereference"] = evidence,
                ["mtc_targettype"] = type,
                ["mtc_targetvalue"] = target,
                ["mtc_verificationmethod"] = method,
                ["mtc_expireson"] = expiry,
                ["mtc_reviewedon"] = now,
                ["mtc_independentreviewer"] = new EntityReference("systemuser", context.InitiatingUserId)
            };
            if (type == "contact") verification["mtc_contact"] = record.ToEntityReference();
            service.Create(verification);
            service.Update(new Entity("mtc_businessparty", party.Id)
            {
                ["mtc_verificationcase"] = verification.ToEntityReference()
            });
            context.OutputParameters["RecordId"] = record.Id;
            context.OutputParameters["VerificationCaseId"] = verification.Id;
        }

        private static void Revoke(IPluginExecutionContext context, IOrganizationService service)
        {
            var type = Input(context, "TargetType", 10);
            var reason = Input(context, "Reason", 1000);
            if (!context.InputParameters.Contains("RecordId") || !(context.InputParameters["RecordId"] is Guid) ||
                (Guid)context.InputParameters["RecordId"] == Guid.Empty)
                throw new ArgumentException("A registry record ID is required.");
            var table = EntityName(type);
            var record = service.Retrieve(table, (Guid)context.InputParameters["RecordId"],
                new ColumnSet("mtc_name", "mtc_verificationstatus", "mtc_businessparty",
                    type == "contact" ? "mtc_emailaddress" : "mtc_domain",
                    "mtc_evidencereference", "mtc_verificationmethod"));
            if (record.GetAttributeValue<OptionSetValue>("mtc_verificationstatus")?.Value != 100000001)
                throw new InvalidPluginExecutionException("Only an approved sender can be revoked.");
            var now = DateTime.UtcNow;
            service.Update(new Entity(table, record.Id)
            {
                ["mtc_verificationstatus"] = new OptionSetValue(100000003),
                ["mtc_expireson"] = now
            });
            var verification = new Entity("mtc_verificationcase", Guid.NewGuid())
            {
                ["mtc_name"] = EventName("Revoked " + record.GetAttributeValue<string>("mtc_name")),
                ["mtc_businessparty"] = record.GetAttributeValue<EntityReference>("mtc_businessparty"),
                ["mtc_reviewstatus"] = new OptionSetValue(100000003),
                ["mtc_evidencereference"] = record.GetAttributeValue<string>("mtc_evidencereference"),
                ["mtc_reason"] = reason,
                ["mtc_targettype"] = type,
                ["mtc_targetvalue"] = record.GetAttributeValue<string>(type == "contact" ? "mtc_emailaddress" : "mtc_domain"),
                ["mtc_verificationmethod"] = record.GetAttributeValue<string>("mtc_verificationmethod"),
                ["mtc_expireson"] = now,
                ["mtc_reviewedon"] = now,
                ["mtc_independentreviewer"] = new EntityReference("systemuser", context.InitiatingUserId)
            };
            if (type == "contact") verification["mtc_contact"] = record.ToEntityReference();
            service.Create(verification);
            context.OutputParameters["VerificationCaseId"] = verification.Id;
        }
    }
}
