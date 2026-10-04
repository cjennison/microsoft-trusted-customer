using System;
using System.Linq;
using Microsoft.Xrm.Sdk;

namespace Mtc.Registrar
{
    public sealed class RegistryWriteGuard : IPlugin
    {
        public void Execute(IServiceProvider serviceProvider)
        {
            var context = (IPluginExecutionContext)serviceProvider.GetService(typeof(IPluginExecutionContext));
            if (context.MessageName == "Associate" || context.MessageName == "Disassociate")
            {
                var target = context.InputParameters.Contains("Target")
                    ? context.InputParameters["Target"] as EntityReference : null;
                var related = context.InputParameters.Contains("RelatedEntities")
                    ? context.InputParameters["RelatedEntities"] as EntityReferenceCollection : null;
                var protectedTables = new[] { "mtc_businessparty", "mtc_approvedcontact", "mtc_approveddomain", "mtc_verificationcase" };
                if ((target != null && protectedTables.Contains(target.LogicalName)) ||
                    (related != null && related.Any(reference => protectedTables.Contains(reference.LogicalName))))
                    throw new InvalidPluginExecutionException(
                        "Registry relationships must be set by the authorized Sender Registry verification action.");
                return;
            }
            if (context.MessageName != "Delete")
            {
                for (var parent = context.ParentContext; parent != null; parent = parent.ParentContext)
                {
                    if ((parent.MessageName == "mtc_VerifySender" || parent.MessageName == "mtc_RevokeSender") &&
                        parent.InitiatingUserId == context.InitiatingUserId)
                    {
                        var factory = (IOrganizationServiceFactory)serviceProvider.GetService(typeof(IOrganizationServiceFactory));
                        VerificationApi.RequireRole(factory.CreateOrganizationService(null),
                            context.InitiatingUserId, "MTC Registrar");
                        return;
                    }
                }
            }
            throw new InvalidPluginExecutionException(
                "Registry changes must use the authorized Sender Registry Verify or Revoke action. Direct edits are not allowed.");
        }
    }
}
