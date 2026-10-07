using System;
using System.Linq;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Query;

namespace Mtc.Registrar
{
    // Per-client choice of which verification details a registrar must record.
    // Configured by the tenant-local mtc_RequiredRegistrarFields setting; a missing
    // definition fails closed to requiring every field.
    public sealed class RegistrarRequirements
    {
        public const string SettingName = "mtc_RequiredRegistrarFields";
        public const string Method = "VerificationMethod";
        public const string Evidence = "EvidenceReference";
        public const string Expiry = "ExpiresOn";
        private static readonly string[] Fields = { Method, Evidence, Expiry };

        public bool MethodRequired { get; private set; }
        public bool EvidenceRequired { get; private set; }
        public bool ExpiryRequired { get; private set; }

        public static readonly RegistrarRequirements All = Parse(string.Join(",", Fields));

        public static RegistrarRequirements Parse(string value)
        {
            var names = (value ?? string.Empty).Split(',').Select(name => name.Trim()).Where(name => name.Length > 0).ToArray();
            if (names.Any(name => !Fields.Contains(name, StringComparer.Ordinal)) || names.Distinct().Count() != names.Length)
                throw new InvalidPluginExecutionException(
                    "Invalid " + SettingName + " setting. Use a comma-separated list of VerificationMethod, EvidenceReference and ExpiresOn, or leave it empty.");
            return new RegistrarRequirements
            {
                MethodRequired = names.Contains(Method),
                EvidenceRequired = names.Contains(Evidence),
                ExpiryRequired = names.Contains(Expiry)
            };
        }

        public static RegistrarRequirements Load(IOrganizationService service)
        {
            var query = new QueryExpression("environmentvariabledefinition") { ColumnSet = new ColumnSet("defaultvalue"), TopCount = 2 };
            query.Criteria.AddCondition("schemaname", ConditionOperator.Equal, SettingName);
            var definitions = service.RetrieveMultiple(query).Entities;
            if (definitions.Count == 0) return All;
            return Parse(MailboxRuntime.Setting(service, SettingName));
        }

        public bool Satisfied(Entity row, DateTime now)
        {
            var expiry = row.GetAttributeValue<DateTime?>("mtc_expireson");
            return (expiry.HasValue ? expiry.Value > now : !ExpiryRequired) &&
                (!EvidenceRequired || !string.IsNullOrWhiteSpace(row.GetAttributeValue<string>("mtc_evidencereference"))) &&
                (!MethodRequired || !string.IsNullOrWhiteSpace(row.GetAttributeValue<string>("mtc_verificationmethod")));
        }
    }
}
