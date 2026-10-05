using System;
using System.Collections.Generic;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.Remoting.Messaging;
using System.Runtime.Remoting.Proxies;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.Xrm.Sdk;
using Microsoft.Xrm.Sdk.Messages;
using Microsoft.Xrm.Sdk.Metadata;
using Microsoft.Xrm.Sdk.Query;
using Mtc.Registrar;

internal static class Program
{
    private static int passed;
    private static void Check(bool condition, string message)
    {
        if (!condition) throw new Exception(message);
        passed++;
    }
    private static void Reject(Action action, string fragment)
    {
        try { action(); }
        catch (Exception error)
        {
            Check(error.Message.IndexOf(fragment, StringComparison.OrdinalIgnoreCase) >= 0,
                "Unexpected rejection: " + error.Message);
            return;
        }
        throw new Exception("Expected rejection: " + fragment);
    }
    public static int Main()
    {
        try
        {
            PolicyTests();
            ApiTests();
            GuardTests();
            PagingTests();
            MessagePolicyChecks.Run(Check);
            Console.WriteLine("Registrar plugin: " + passed + " checks passed.");
            return 0;
        }
        catch (Exception error)
        {
            Console.Error.WriteLine(error);
            return 1;
        }
    }

    private static void PolicyTests()
    {
        Check(VerificationPolicy.Target("contact", "Name+tag@BUSINESS.example") == "Name+tag@business.example",
            "Meaningful local-part characters must be preserved.");
        Check(VerificationPolicy.Target("domain", "BUSINESS.example") == "business.example", "Domain must normalize.");
        foreach (var provider in new[] { "gmail.com", "outlook.com", "yahoo.com", "proton.me" })
            Reject(() => VerificationPolicy.Target("domain", provider), "Shared email providers");
        foreach (var domain in new[] { "*.business.example", "business.example.", "https://business.example", "127.0.0.1", " business.example" })
            Reject(() => VerificationPolicy.Target("domain", domain), "");
        foreach (var address in new[] { "a@@business.example", "Name <a@business.example>", "a..b@business.example", "" })
            Reject(() => VerificationPolicy.Target("contact", address), "");
        Reject(() => VerificationPolicy.Expiry(DateTime.UtcNow.AddMinutes(-1), DateTime.UtcNow), "future");
        Reject(() => VerificationPolicy.Text("bad\u0001evidence", "Evidence", 1000), "control");
    }

    private static ContextProxy Verification(FakeService service)
    {
        return new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = "mtc_VerifySender", ["UserId"] = service.UserId,
            ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection
            {
                ["TargetType"] = "contact", ["TargetValue"] = "proof@business.example",
                ["BusinessName"] = "Synthetic business", ["VerificationMethod"] = "Synthetic independent ownership fixture",
                ["EvidenceReference"] = "synthetic://registrar/ownership",
                ["ExpiresOn"] = DateTime.UtcNow.AddDays(1)
            },
            ["OutputParameters"] = new ParameterCollection(), ["SharedVariables"] = new ParameterCollection()
        });
    }

    private static void ApiTests()
    {
        var service = new FakeService();
        var context = Verification(service);
        var provider = new Provider(context.Value, service);
        Reject(() => new VerificationApi().Execute(provider), "not an authorized");
        Check(service.Rows.Count == 0, "Unauthorized verification must not write.");
        service.HasRegistrarRole = true;
        service.Disabled = true;
        Reject(() => new VerificationApi().Execute(provider), "enabled interactive");
        service.Disabled = false;
        service.ApplicationId = Guid.NewGuid();
        Reject(() => new VerificationApi().Execute(provider), "enabled interactive");
        service.ApplicationId = Guid.Empty;
        context.Values["UserId"] = Guid.NewGuid();
        Reject(() => new VerificationApi().Execute(provider), "impersonated");
        context.Values["UserId"] = service.UserId;
        service.KeyActive = false;
        Reject(() => new VerificationApi().Execute(provider), "index is not active");
        service.KeyActive = true;
        var input = (ParameterCollection)context.Values["InputParameters"];
        input["ExpiresOn"] = DateTime.UtcNow.AddDays(-1);
        Reject(() => new VerificationApi().Execute(provider), "future");
        input["ExpiresOn"] = DateTime.UtcNow.AddDays(1);
        input["EvidenceReference"] = "";
        Reject(() => new VerificationApi().Execute(provider), "EvidenceReference");
        input["EvidenceReference"] = "synthetic://registrar/ownership";
        new VerificationApi().Execute(provider);
        var contacts = service.Rows.Where(row => row.LogicalName == "mtc_approvedcontact").ToArray();
        Check(contacts.Length == 1, "Verification must create one contact.");
        var contact = contacts.Single();
        Check(contact.GetAttributeValue<EntityReference>("mtc_independentreviewer").Id == service.UserId,
            "Verifier must be the actual caller.");
        Check(contact.GetAttributeValue<DateTime>("mtc_verifiedon") <= DateTime.UtcNow, "Time must be server stamped.");
        var id = contact.Id;
        new VerificationApi().Execute(provider);
        Check(service.Rows.Count(row => row.LogicalName == "mtc_approvedcontact") == 1 &&
            service.Rows.Single(row => row.LogicalName == "mtc_approvedcontact").Id == id,
            "Renewal must reuse the same registry row.");
        Check(service.Rows.Count(row => row.LogicalName == "mtc_verificationcase") == 2,
            "Renewal must preserve an additional verification event.");
        Check(service.Rows.Where(row => row.LogicalName == "mtc_verificationcase").All(row =>
            row.GetAttributeValue<string>("mtc_targetvalue") == "proof@business.example" &&
            row.GetAttributeValue<string>("mtc_verificationmethod") != null &&
            row.GetAttributeValue<DateTime>("mtc_expireson") > DateTime.UtcNow),
            "Verification events must preserve the exact target, method, and expiry.");
        context.Values["MessageName"] = "mtc_RevokeSender";
        context.Values["InputParameters"] = new ParameterCollection
        {
            ["TargetType"] = "contact", ["RecordId"] = id, ["Reason"] = "Synthetic revocation test"
        };
        new VerificationApi().Execute(provider);
        Check(contact.GetAttributeValue<OptionSetValue>("mtc_verificationstatus").Value == 100000003,
            "Revocation must invalidate the approved record.");
        Check(contact.GetAttributeValue<DateTime>("mtc_expireson") <= DateTime.UtcNow, "Revocation must expire recognition.");
        Reject(() => new VerificationApi().Execute(provider), "Only an approved");
        var domainContext = Verification(service);
        var domainInput = (ParameterCollection)domainContext.Values["InputParameters"];
        domainInput["TargetType"] = "domain";
        domainInput["TargetValue"] = "business.example";
        var domainProvider = new Provider(domainContext.Value, service);
        new VerificationApi().Execute(domainProvider);
        var domain = service.Rows.Single(row => row.LogicalName == "mtc_approveddomain");
        domainContext.Values["MessageName"] = "mtc_RevokeSender";
        domainContext.Values["InputParameters"] = new ParameterCollection
        {
            ["TargetType"] = "domain", ["RecordId"] = domain.Id, ["Reason"] = "Synthetic domain revocation"
        };
        new VerificationApi().Execute(domainProvider);
        Check(domain.GetAttributeValue<OptionSetValue>("mtc_verificationstatus").Value == 100000003,
            "Domain revocation must use domain-only columns and invalidate recognition.");
    }

    private static void GuardTests()
    {
        var service = new FakeService { HasRegistrarRole = true };
        var context = new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = "Update", ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection()
        });
        var provider = new Provider(context.Value, service);
        Reject(() => new RegistryWriteGuard().Execute(provider), "Direct edits");
        context.Values["ParentContext"] = Verification(service).Value;
        new RegistryWriteGuard().Execute(provider);
        Check(true, "Authorized API ancestry must pass.");
        service.HasRegistrarRole = false;
        Reject(() => new RegistryWriteGuard().Execute(provider), "not an authorized");
        service.HasRegistrarRole = true;
        context.Values["MessageName"] = "Delete";
        Reject(() => new RegistryWriteGuard().Execute(provider), "Direct edits");
        context.Values["MessageName"] = "Associate";
        context.Values["InputParameters"] = new ParameterCollection
        {
            ["Target"] = new EntityReference("systemuser", service.UserId),
            ["RelatedEntities"] = new EntityReferenceCollection
            {
                new EntityReference("mtc_approvedcontact", Guid.NewGuid())
            }
        };
        Reject(() => new RegistryWriteGuard().Execute(provider), "relationships");
        context.Values["InputParameters"] = new ParameterCollection
        {
            ["Target"] = new EntityReference("systemuser", service.UserId),
            ["RelatedEntities"] = new EntityReferenceCollection { new EntityReference("role", Guid.NewGuid()) }
        };
        new RegistryWriteGuard().Execute(provider);
        Check(true, "Unrelated role associations must remain unaffected.");
    }

    private static void PagingTests()
    {
        var initial = "https://graph.microsoft.com/v1.0/users/operator%40customer.example/messages?$select=id,internetMessageHeaders";
        var context = new PagingContext(new HttpRequestMessage(HttpMethod.Get, initial));
        context.Request.Headers.Authorization = new System.Net.Http.Headers.AuthenticationHeaderValue("Bearer", "SYNTHETIC");
        var script = new Script { Context = context };
        script.ExecuteAsync().GetAwaiter().GetResult();
        Check(context.Sent == 1 && context.Request.Headers.GetValues("Prefer").Single() == "IdType=\"ImmutableId\"",
            "Paging must enforce immutable IDs.");
        Check(context.Request.Headers.Authorization.Parameter == "SYNTHETIC", "Paging must preserve platform authentication.");
        var page = initial + "&$skip=50";
        context.Request.Headers.Add("x-mtc-page-url", page);
        script.ExecuteAsync().GetAwaiter().GetResult();
        Check(context.Request.RequestUri.OriginalString == page && !context.Request.Headers.Contains("x-mtc-page-url"),
            "Paging must preserve the exact Graph URL and remove its internal header.");
        foreach (var invalid in new[]
        {
            "https://attacker.example/v1.0/users/operator%40customer.example/messages?$select=id,internetMessageHeaders",
            "http://graph.microsoft.com/v1.0/users/operator%40customer.example/messages?$select=id,internetMessageHeaders",
            "https://graph.microsoft.com/v1.0/users/other%40customer.example/messages?$select=id,internetMessageHeaders",
            "https://graph.microsoft.com/v1.0/users/operator%40customer.example/messages?$select=id,body,internetMessageHeaders",
            "https://graph.microsoft.com/v1.0/users/operator%40customer.example/messages?$select=id,internetMessageHeaders&$expand=attachments",
            "https://graph.microsoft.com/v1.0/users/operator%40customer.example/mailFolders/inbox?$select=id,internetMessageHeaders"
        })
        {
            var bad = new PagingContext(new HttpRequestMessage(HttpMethod.Get, initial));
            bad.Request.Headers.Add("x-mtc-page-url", invalid);
            Reject(() => new Script { Context = bad }.ExecuteAsync().GetAwaiter().GetResult(), "");
            Check(bad.Sent == 0, "Invalid paging must fail before any authenticated request.");
        }
    }

    private sealed class PagingContext : IScriptContext
    {
        public string OperationId => "ListMailboxMessages";
        public HttpRequestMessage Request { get; }
        public int Sent;
        public PagingContext(HttpRequestMessage request) { Request = request; }
        public Task<HttpResponseMessage> SendAsync(HttpRequestMessage request, CancellationToken cancellationToken)
        {
            Sent++;
            return Task.FromResult(new HttpResponseMessage(HttpStatusCode.OK));
        }
    }

    private sealed class ContextProxy : RealProxy
    {
        public readonly Dictionary<string, object> Values;
        public IPluginExecutionContext Value => (IPluginExecutionContext)GetTransparentProxy();
        public ContextProxy(Dictionary<string, object> values) : base(typeof(IPluginExecutionContext)) { Values = values; }
        public override IMessage Invoke(IMessage message)
        {
            var call = (IMethodCallMessage)message;
            var name = call.MethodName.Substring(4);
            Values.TryGetValue(name, out var result);
            if (result == null && ((System.Reflection.MethodInfo)call.MethodBase).ReturnType.IsValueType)
                result = Activator.CreateInstance(((System.Reflection.MethodInfo)call.MethodBase).ReturnType);
            return new ReturnMessage(result, null, 0, call.LogicalCallContext, call);
        }
    }

    private sealed class Provider : IServiceProvider, IOrganizationServiceFactory, ITracingService
    {
        private readonly IPluginExecutionContext context;
        private readonly IOrganizationService service;
        public Provider(IPluginExecutionContext context, IOrganizationService service) { this.context = context; this.service = service; }
        public object GetService(Type type)
        {
            if (type == typeof(IPluginExecutionContext)) return context;
            if (type == typeof(IOrganizationServiceFactory) || type == typeof(ITracingService)) return this;
            throw new InvalidOperationException("Unexpected service: " + type);
        }
        public IOrganizationService CreateOrganizationService(Guid? userId) => service;
        public void Trace(string format, params object[] args) { }
    }

    private sealed class FakeService : IOrganizationService
    {
        public readonly Guid UserId = Guid.NewGuid();
        public readonly List<Entity> Rows = new List<Entity>();
        public bool HasRegistrarRole, Disabled;
        public Guid ApplicationId;
        public bool KeyActive = true;
        public Guid Create(Entity entity)
        {
            if (entity.Id == Guid.Empty) entity.Id = Guid.NewGuid();
            entity["statecode"] = new OptionSetValue(0);
            Rows.Add(entity);
            return entity.Id;
        }
        public void Update(Entity entity)
        {
            var row = Rows.Single(existing => existing.Id == entity.Id);
            foreach (var attribute in entity.Attributes) row[attribute.Key] = attribute.Value;
        }
        public Entity Retrieve(string table, Guid id, ColumnSet columns)
        {
            if (table == "systemuser") return new Entity(table, id) { ["isdisabled"] = Disabled, ["applicationid"] = ApplicationId };
            if ((table == "mtc_approveddomain" && columns.Columns.Contains("mtc_emailaddress")) ||
                (table == "mtc_approvedcontact" && columns.Columns.Contains("mtc_domain")))
                throw new InvalidOperationException("Identity column does not exist on the requested table.");
            return Rows.Single(row => row.LogicalName == table && row.Id == id);
        }
        public EntityCollection RetrieveMultiple(QueryBase query)
        {
            var expression = (QueryExpression)query;
            if (expression.EntityName == "role")
                return new EntityCollection(HasRegistrarRole ? new List<Entity> { new Entity("role", Guid.NewGuid()) } : new List<Entity>());
            var rows = Rows.Where(row => row.LogicalName == expression.EntityName).Where(row =>
                expression.Criteria.Conditions.All(condition => Equals(
                    row.Contains(condition.AttributeName) ? row[condition.AttributeName] : null, condition.Values[0]))).ToList();
            return new EntityCollection(rows);
        }
        public OrganizationResponse Execute(OrganizationRequest request)
        {
            if (request is RetrieveEntityKeyRequest)
            {
                var metadata = new EntityKeyMetadata();
                typeof(EntityKeyMetadata).GetProperty("EntityKeyIndexStatus").SetValue(metadata,
                    KeyActive ? EntityKeyIndexStatus.Active : EntityKeyIndexStatus.Pending, null);
                return new RetrieveEntityKeyResponse
                {
                    Results = new ParameterCollection
                    {
                        ["EntityKeyMetadata"] = metadata
                    }
                };
            }
            throw new InvalidOperationException("Unexpected request: " + request.RequestName);
        }
        public void Delete(string table, Guid id) => throw new InvalidOperationException("Unexpected deletion.");
        public void Associate(string table, Guid id, Relationship relationship, EntityReferenceCollection related) => throw new InvalidOperationException();
        public void Disassociate(string table, Guid id, Relationship relationship, EntityReferenceCollection related) => throw new InvalidOperationException();
    }
}
