using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using System.Net;
using System.Net.Http;
using System.Runtime.Remoting.Messaging;
using System.Runtime.Remoting.Proxies;
using System.Runtime.Serialization.Json;
using System.Text;
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
            LabelTests();
            WildcardTests();
            RequirementTests();
            LabelLogTests();
            BeginPollTests();
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
        Check(VerificationPolicy.Target("domain", "*.Business.example") == "*.business.example",
            "A subdomain wildcard must normalize and keep its explicit marker.");
        foreach (var broad in new[] { "*.gmail.com", "*.co.uk", "*.com.au", "*.onmicrosoft.com", "*.sharepointonline.com" })
            Reject(() => VerificationPolicy.Target("domain", broad), "");
        foreach (var malformed in new[] { "*.", "*", "**.business.example", "*.*.business.example", "a.*.business.example", "*business.example", "*.com" })
            Reject(() => VerificationPolicy.Target("domain", malformed), "");
        Check(VerificationPolicy.Target("contact", "Name+tag@BUSINESS.example") == "Name+tag@business.example",
            "Meaningful local-part characters must be preserved.");
        Check(VerificationPolicy.Target("domain", "BUSINESS.example") == "business.example", "Domain must normalize.");
        foreach (var provider in new[] { "gmail.com", "outlook.com", "yahoo.com", "proton.me" })
            Reject(() => VerificationPolicy.Target("domain", provider), "Shared email providers");
        foreach (var domain in new[] { "business.example.", "https://business.example", "127.0.0.1", " business.example" })
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

    private static void LabelLogTests()
    {
        var service = new FakeService { HasRegistrarRole = true, HasProcessorRole = true };
        new VerificationApi().Execute(new Provider(Verification(service).Value, service));
        service.Create(new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = "mtc_LabelingMode", ["defaultvalue"] = "Production"
        });
        service.Create(new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = "mtc_OperatorAlertDestination", ["defaultvalue"] = "user:" + service.UserId
        });
        service.Create(new Entity("mtc_mailboxenrollment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_enrollmentstatus"] = new OptionSetValue(100000001),
            ["mtc_excludedfolderids"] = "sent\ndrafts\noutbox\ndeleted\npurges"
        });
        var assessment = new Entity("mtc_messageassessment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_stablemessageid"] = "LogID", ["mtc_receivedon"] = DateTime.UtcNow.AddHours(-1)
        };
        service.Create(assessment);
        var row = service.Rows.Single(item => item.Id == assessment.Id);
        Func<string, ContextProxy> context = name => new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = name, ["UserId"] = service.UserId, ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection { ["AssessmentId"] = assessment.Id },
            ["OutputParameters"] = new ParameterCollection()
        });
        var message = new GraphMessage
        {
            Id = "LogID", ETag = "etag", ParentFolderId = "inbox", Categories = new[] { "Personal" },
            From = new GraphParty { EmailAddress = new GraphAddress { Address = "proof@business.example" } },
            ReplyTo = Array.Empty<GraphParty>(),
            Headers = new[] {
                new GraphHeader { Name = "Authentication-Results", Value = "mx.microsoft.com 1; spf=pass; dkim=pass; dmarc=pass header.from=business.example; compauth=pass" },
                new GraphHeader { Name = "X-MS-Exchange-Organization-AuthSource", Value = "receiver.prod.outlook.com" },
                new GraphHeader { Name = "X-MS-Exchange-Organization-MessageDirectionality", Value = "Incoming" }
            }
        };
        Func<string, ParameterCollection> run = name =>
        {
            var proxy = context(name);
            var input = (ParameterCollection)proxy.Values["InputParameters"];
            input["MessageJson"] = Json(message);
            if (name == "mtc_VerifyMessagePresentation") input["ExpectedCategoriesJson"] = Json(message.Categories);
            if (name == "mtc_ReportPresentationFailure") input["Reason"] = "Synthetic connector error: PreconditionFailed";
            new LabelRuntime().Execute(new Provider(proxy.Value, service));
            return (ParameterCollection)proxy.Values["OutputParameters"];
        };
        var plan = run("mtc_GetMessageLabelPlan");
        message.Categories = new[] { "Personal", "\u2713" };
        run("mtc_VerifyMessagePresentation");
        var first = row.GetAttributeValue<DateTime?>("mtc_firstpresentedon");
        Check(first != null && row.GetAttributeValue<OptionSetValue>("mtc_presentationstatus").Value == 100000001,
            "A verified readback records when the message was first labeled.");
        run("mtc_VerifyMessagePresentation");
        Check(row.GetAttributeValue<DateTime?>("mtc_firstpresentedon") == first, "Re-verification keeps the original first-labeled time.");
        run("mtc_ReportPresentationFailure");
        Check(row.GetAttributeValue<OptionSetValue>("mtc_presentationstatus").Value == 100000002 &&
            row.GetAttributeValue<string>("mtc_lastpresentationerror").Contains("PreconditionFailed"),
            "A labeling failure records its actual error on the message.");
        foreach (var folder in new[] { "deleted", "purges" })
        {
            message.ParentFolderId = folder;
            plan = run("mtc_GetMessageLabelPlan");
            Check(!(bool)plan["NeedsWrite"] && row.GetAttributeValue<OptionSetValue>("mtc_presentationstatus").Value == 100000003,
                "Deleted or purged mail is settled as not applicable without a category write.");
            run("mtc_VerifyMessagePresentation");
            run("mtc_ReportPresentationFailure");
            Check(row.GetAttributeValue<OptionSetValue>("mtc_presentationstatus").Value == 100000003,
                "Not-applicable messages never become failures or alerts.");
        }
        Check(service.Notifications == 1, "Only the genuine labeling failure alerted the operator.");
    }

    private static void BeginPollTests()
    {
        var service = new FakeService { HasProcessorRole = true };
        service.Create(new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = "mtc_ProcessingMode", ["defaultvalue"] = "Shadow"
        });
        Func<string, Guid> mailbox = folders => service.Create(new Entity("mtc_mailboxenrollment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "mailbox@customer.example",
            ["mtc_enrollmentstatus"] = new OptionSetValue(100000001),
            ["mtc_excludedfolderids"] = folders, ["versionnumber"] = 1L
        });
        Func<Guid, ParameterCollection> begin = id =>
        {
            var proxy = new ContextProxy(new Dictionary<string, object>
            {
                ["MessageName"] = "mtc_BeginMailboxPoll", ["UserId"] = service.UserId, ["InitiatingUserId"] = service.UserId,
                ["InputParameters"] = new ParameterCollection { ["MailboxRecordId"] = id },
                ["OutputParameters"] = new ParameterCollection()
            });
            new MailboxRuntime().Execute(new Provider(proxy.Value, service));
            return (ParameterCollection)proxy.Values["OutputParameters"];
        };
        var nine = string.Join("\n", Enumerable.Range(1, 9).Select(index => "folder" + index));
        Check((bool)begin(mailbox(nine))["Enabled"],
            "Recoverable Items folders added to the exclusions must not block mailbox polling.");
        Check((bool)begin(mailbox("sent\ndrafts\noutbox\ndeleted"))["Enabled"], "The original four exclusions still poll.");
        Reject(() => begin(mailbox("sent\ndrafts\noutbox")), "exclusions");
        Reject(() => begin(mailbox(string.Join("\n", Enumerable.Range(1, 17).Select(index => "folder" + index)))), "exclusions");
    }

    private static void WildcardTests()
    {
        var service = new FakeService { HasRegistrarRole = true, HasProcessorRole = true };
        Action<string> verifyDomain = target =>
        {
            var verification = Verification(service);
            var parameters = (ParameterCollection)verification.Values["InputParameters"];
            parameters["TargetType"] = "domain";
            parameters["TargetValue"] = target;
            new VerificationApi().Execute(new Provider(verification.Value, service));
        };
        verifyDomain("*.business.example");
        service.Create(new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = "mtc_LabelingMode", ["defaultvalue"] = "Production"
        });
        service.Create(new Entity("mtc_mailboxenrollment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_enrollmentstatus"] = new OptionSetValue(100000001), ["mtc_excludedfolderids"] = "sent"
        });
        var assessment = new Entity("mtc_messageassessment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_stablemessageid"] = "WildcardID", ["mtc_receivedon"] = DateTime.UtcNow.AddDays(-1)
        };
        service.Create(assessment);
        var context = new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = "mtc_GetMessageLabelPlan", ["UserId"] = service.UserId,
            ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection { ["AssessmentId"] = assessment.Id },
            ["OutputParameters"] = new ParameterCollection()
        });
        var input = (ParameterCollection)context.Values["InputParameters"];
        var output = (ParameterCollection)context.Values["OutputParameters"];
        Func<string, string, bool> knownWithReply = null;
        Func<string, bool> known = address => knownWithReply(address, null);
        knownWithReply = (address, reply) =>
        {
            var domain = address.Substring(address.IndexOf('@') + 1);
            input["MessageJson"] = Json(new GraphMessage
            {
                Id = "WildcardID", ETag = "etag", ParentFolderId = "inbox", Categories = Array.Empty<string>(),
                From = new GraphParty { EmailAddress = new GraphAddress { Address = address } },
                ReplyTo = reply == null ? Array.Empty<GraphParty>() : new[] { new GraphParty { EmailAddress = new GraphAddress { Address = reply } } },
                Headers = new[] {
                    new GraphHeader { Name = "Authentication-Results", Value = "mx.microsoft.com 1; spf=pass; dkim=pass; dmarc=pass header.from=" + domain + "; compauth=pass" },
                    new GraphHeader { Name = "X-MS-Exchange-Organization-AuthSource", Value = "receiver.prod.outlook.com" },
                    new GraphHeader { Name = "X-MS-Exchange-Organization-MessageDirectionality", Value = "Incoming" }
                }
            });
            new LabelRuntime().Execute(new Provider(context.Value, service));
            return Categories((string)output["CategoriesJson"]).Contains("\u2713");
        };
        Check(known("a@business.example"), "A wildcard approval covers its base domain.");
        Check(known("a@mail.business.example") && known("a@deep.mail.business.example"), "A wildcard approval covers every subdomain.");
        Check(!known("a@notbusiness.example") && !known("a@business.example.evil.example"),
            "A wildcard must not match lookalike or suffix-appended domains.");
        Check(((string)service.Rows.Single(row => row.Id == assessment.Id)["mtc_reasoncodes"]).Contains("MTC_REGISTRY_NO_MATCH"),
            "Non-matching domains record no registry match.");
        verifyDomain("mail.business.example");
        var narrower = service.Rows.Single(row => row.LogicalName == "mtc_approveddomain" &&
            (string)row["mtc_domain"] == "mail.business.example");
        new VerificationApi().Execute(new Provider(new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = "mtc_RevokeSender", ["UserId"] = service.UserId, ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection
            {
                ["TargetType"] = "domain", ["RecordId"] = narrower.Id, ["Reason"] = "Synthetic narrower revocation"
            },
            ["OutputParameters"] = new ParameterCollection(), ["SharedVariables"] = new ParameterCollection()
        }).Value, service));
        Check(!known("a@mail.business.example"), "A revoked narrower entry must not be overridden by a broader wildcard.");
        Check(known("a@other.business.example"), "Other subdomains stay covered by the wildcard.");
        Check(knownWithReply("a@other.business.example", "replies@news.business.example"),
            "A Reply-To covered by an approval (here the wildcard) keeps the sender Known.");
        Check(!knownWithReply("a@other.business.example", "replies@mail.business.example"),
            "A Reply-To at a revoked identity is not approved.");
        Check(!knownWithReply("a@other.business.example", "invoices@business-example.net"),
            "A Reply-To outside every approval must fail closed.");
    }

    private static void RequirementTests()
    {
        Check(!RegistrarRequirements.Parse("").MethodRequired && !RegistrarRequirements.Parse(null).ExpiryRequired,
            "An empty setting makes every verification detail optional.");
        var some = RegistrarRequirements.Parse(" ExpiresOn , EvidenceReference ");
        Check(some.ExpiryRequired && some.EvidenceRequired && !some.MethodRequired, "Listed fields must be required.");
        foreach (var invalid in new[] { "Expiry", "expireson", "ExpiresOn,ExpiresOn", "All" })
            Reject(() => RegistrarRequirements.Parse(invalid), "Invalid mtc_RequiredRegistrarFields");

        var service = new FakeService { HasRegistrarRole = true, HasProcessorRole = true };
        var setting = new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = RegistrarRequirements.SettingName, ["defaultvalue"] = ""
        };
        service.Create(setting);
        var verification = Verification(service);
        var parameters = (ParameterCollection)verification.Values["InputParameters"];
        parameters.Remove("VerificationMethod");
        parameters.Remove("EvidenceReference");
        parameters.Remove("ExpiresOn");
        // Dataverse passes DateTime.MinValue when the optional ExpiresOn parameter is omitted.
        parameters["ExpiresOn"] = DateTime.MinValue;
        var provider = new Provider(verification.Value, service);
        parameters["EvidenceReference"] = "  ";
        Reject(() => new VerificationApi().Execute(provider), "EvidenceReference");
        parameters.Remove("EvidenceReference");
        new VerificationApi().Execute(provider);
        var contact = service.Rows.Single(row => row.LogicalName == "mtc_approvedcontact");
        Check(contact.GetAttributeValue<DateTime?>("mtc_expireson") == null &&
            contact.GetAttributeValue<string>("mtc_evidencereference") == null &&
            contact.GetAttributeValue<string>("mtc_verificationmethod") == null,
            "Optional details that were left blank must be stored as blank, with no expiry.");

        service.Create(new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = "mtc_LabelingMode", ["defaultvalue"] = "Production"
        });
        service.Create(new Entity("mtc_mailboxenrollment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_enrollmentstatus"] = new OptionSetValue(100000001), ["mtc_excludedfolderids"] = "sent"
        });
        var assessment = new Entity("mtc_messageassessment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_stablemessageid"] = "RequirementID", ["mtc_receivedon"] = DateTime.UtcNow.AddDays(-1)
        };
        service.Create(assessment);
        var plan = new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = "mtc_GetMessageLabelPlan", ["UserId"] = service.UserId, ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection
            {
                ["AssessmentId"] = assessment.Id,
                ["MessageJson"] = Json(new GraphMessage
                {
                    Id = "RequirementID", ETag = "etag", ParentFolderId = "inbox", Categories = Array.Empty<string>(),
                    From = new GraphParty { EmailAddress = new GraphAddress { Address = "proof@business.example" } },
                    ReplyTo = Array.Empty<GraphParty>(),
                    Headers = new[] {
                        new GraphHeader { Name = "Authentication-Results", Value = "mx.microsoft.com 1; dmarc=pass header.from=business.example; compauth=pass" },
                        new GraphHeader { Name = "X-MS-Exchange-Organization-AuthSource", Value = "receiver.prod.outlook.com" },
                        new GraphHeader { Name = "X-MS-Exchange-Organization-MessageDirectionality", Value = "Incoming" }
                    }
                })
            },
            ["OutputParameters"] = new ParameterCollection()
        });
        Func<bool> known = () =>
        {
            new LabelRuntime().Execute(new Provider(plan.Value, service));
            return Categories((string)((ParameterCollection)plan.Values["OutputParameters"])["CategoriesJson"]).Contains("\u2713");
        };
        Check(known(), "A sender approved without optional details must be Known when this client does not require them.");

        setting["defaultvalue"] = "ExpiresOn";
        Check(!known(), "When a client starts requiring expiry, entries without one must stop qualifying until renewed.");
        Reject(() => new VerificationApi().Execute(provider), "ExpiresOn is required");
        parameters.Remove("ExpiresOn");
        Reject(() => new VerificationApi().Execute(provider), "ExpiresOn is required");
        parameters["ExpiresOn"] = DateTime.UtcNow.AddDays(-1);
        Reject(() => new VerificationApi().Execute(provider), "future");
        parameters["ExpiresOn"] = DateTime.UtcNow.AddDays(30);
        new VerificationApi().Execute(provider);
        Check(known(), "Renewing with the newly required expiry must restore Known.");

        setting["defaultvalue"] = "ExpiresOn,EvidenceReference,VerificationMethod";
        Check(!known(), "Newly required evidence and method must be present on existing entries.");
        Reject(() => new VerificationApi().Execute(provider), "EvidenceReference is required");
        setting["defaultvalue"] = "Bogus";
        Reject(() => new VerificationApi().Execute(provider), "Invalid mtc_RequiredRegistrarFields");
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

    private static string[] Categories(string json)
    {
        using (var stream = new MemoryStream(Encoding.UTF8.GetBytes(json)))
            return (string[])new DataContractJsonSerializer(typeof(string[])).ReadObject(stream);
    }

    private static string Json<T>(T value)
    {
        using (var stream = new MemoryStream())
        {
            new DataContractJsonSerializer(typeof(T)).WriteObject(stream, value);
            return Encoding.UTF8.GetString(stream.ToArray());
        }
    }

    private static void LabelTests()
    {
        var service = new FakeService { HasRegistrarRole = true, HasProcessorRole = true };
        new VerificationApi().Execute(new Provider(Verification(service).Value, service));
        var contact = service.Rows.Single(row => row.LogicalName == "mtc_approvedcontact");
        var definition = new Entity("environmentvariabledefinition", Guid.NewGuid())
        {
            ["schemaname"] = "mtc_LabelingMode", ["defaultvalue"] = "Pilot"
        };
        service.Create(definition);
        service.Create(new Entity("mtc_mailboxenrollment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_enrollmentstatus"] = new OptionSetValue(100000001),
            ["mtc_excludedfolderids"] = "sent\ndrafts\noutbox\ndeleted"
        });
        var assessment = new Entity("mtc_messageassessment", Guid.NewGuid())
        {
            ["mtc_mailboxreference"] = "operator@customer.example",
            ["mtc_stablemessageid"] = "OpaqueAaID", ["mtc_receivedon"] = DateTime.UtcNow.AddDays(-1)
        };
        service.Create(assessment);
        var message = new GraphMessage
        {
            Id = "OpaqueAaID", ETag = "fixture-etag", ParentFolderId = "inbox",
            From = new GraphParty { EmailAddress = new GraphAddress { Address = "proof@business.example" } },
            Sender = new GraphParty { EmailAddress = new GraphAddress { Address = "proof@business.example" } },
            ReplyTo = Array.Empty<GraphParty>(),
            Headers = new[] {
                new GraphHeader { Name = "Authentication-Results", Value = "mx.microsoft.com 1; spf=pass; dkim=pass; dmarc=pass header.from=business.example; compauth=pass" },
                new GraphHeader { Name = "X-MS-Exchange-Organization-AuthSource", Value = "receiver.prod.outlook.com" },
                new GraphHeader { Name = "X-MS-Exchange-Organization-MessageDirectionality", Value = "Incoming" }
            }
        };
        var context = new ContextProxy(new Dictionary<string, object>
        {
            ["MessageName"] = "mtc_GetMessageLabelPlan", ["UserId"] = service.UserId,
            ["InitiatingUserId"] = service.UserId,
            ["InputParameters"] = new ParameterCollection { ["AssessmentId"] = assessment.Id },
            ["OutputParameters"] = new ParameterCollection()
        });
        var input = (ParameterCollection)context.Values["InputParameters"];
        var output = (ParameterCollection)context.Values["OutputParameters"];
        var provider = new Provider(context.Value, service);
        var runtime = new LabelRuntime();
        Action plan = () => { input["MessageJson"] = Json(message); runtime.Execute(provider); };
        var known = new[] { "Personal", "\u2713" };
        var unknown = new[] { "Personal", "Unknown sender" };
        foreach (var mode in new[] { "Pilot", "Production" })
        {
            definition["defaultvalue"] = mode;
            message.Categories = new[] { "Personal", "MTC Proof - known sender", "MTC Proof - not known",
                "MTC - known sender", "MTC - not known", "\u2713 Known sender", "Unknown sender" };
            plan();
            Check((string)output["CategoriesJson"] == Json(known),
                "Both modes must use one checkmark label, remove legacy-owned labels, and preserve Personal.");
            Check((bool)output["NeedsWrite"] && (string)output["ETag"] == message.ETag,
                "Renamed presentation must retain conditional ETag transport.");
            message.Categories = known;
            plan();
            Check(!(bool)output["NeedsWrite"], "A current checkmark category must not require another write.");
        }
        context.Values["MessageName"] = "mtc_VerifyMessagePresentation";
        input["ExpectedCategoriesJson"] = Json(known);
        input["MessageJson"] = Json(message);
        runtime.Execute(provider);
        Check(assessment.GetAttributeValue<OptionSetValue>("mtc_presentationstatus").Value == 100000001,
            "Readback must accept the exact new Known category.");
        message.Categories = new[] { "Personal", "MTC - known sender" };
        input["MessageJson"] = Json(message);
        input["ExpectedCategoriesJson"] = Json(message.Categories);
        Reject(() => runtime.Execute(provider), "eligibility changed");
        contact["mtc_verificationstatus"] = new OptionSetValue(100000003);
        context.Values["MessageName"] = "mtc_GetMessageLabelPlan";
        message.Categories = known;
        plan();
        Check((string)output["CategoriesJson"] == Json(unknown),
            "Revocation must replace the checkmark with Unknown sender and preserve Personal.");
        context.Values["MessageName"] = "mtc_VerifyMessagePresentation";
        input["ExpectedCategoriesJson"] = Json(known);
        input["MessageJson"] = Json(message);
        Reject(() => runtime.Execute(provider), "eligibility changed");
        message.Categories = unknown;
        input["ExpectedCategoriesJson"] = Json(unknown);
        input["MessageJson"] = Json(message);
        runtime.Execute(provider);
        Check(assessment.GetAttributeValue<OptionSetValue>("mtc_presentationstatus").Value == 100000001,
            "Readback must accept the exact new Unknown category after revocation.");
        contact["mtc_verificationstatus"] = new OptionSetValue(100000001);
        message.Headers[0].Value = message.Headers[0].Value.Replace("dmarc=pass", "dmarc=fail");
        context.Values["MessageName"] = "mtc_GetMessageLabelPlan";
        plan();
        Check((string)output["CategoriesJson"] == Json(unknown), "Failed authentication must still use Unknown sender.");
        definition["defaultvalue"] = "Disabled";
        Reject(plan, "disabled");
        definition["defaultvalue"] = "Pilot";
        message.Id = "OpaqueAAID";
        Reject(plan, "Exact immutable identity");
        message.Id = "OpaqueAaID";
        service.HasProcessorRole = false;
        Reject(plan, "not an authorized");
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
        public bool HasRegistrarRole, HasProcessorRole, Disabled;
        public Guid ApplicationId;
        public bool KeyActive = true;
        public int Notifications;
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
            {
                var role = expression.Criteria.Conditions.Single(condition => condition.AttributeName == "name").Values[0] as string;
                var authorized = role == "MTC Registrar" ? HasRegistrarRole : role == "MTC Processor" && HasProcessorRole;
                return new EntityCollection(authorized ? new List<Entity> { new Entity("role", Guid.NewGuid()) } : new List<Entity>());
            }
            var rows = Rows.Where(row => row.LogicalName == expression.EntityName).Where(row =>
                expression.Criteria.Conditions.All(condition => condition.Operator == ConditionOperator.NotNull
                    ? row.Contains(condition.AttributeName) && row[condition.AttributeName] != null
                    : Equals(Normalize(row.Contains(condition.AttributeName) ? row[condition.AttributeName] : null), condition.Values[0])))
                .Take(expression.TopCount ?? int.MaxValue).ToList();
            return new EntityCollection(rows);
        }
        private static object Normalize(object value) =>
            value is OptionSetValue option ? (object)option.Value : value is EntityReference reference ? reference.Id : value;
        public OrganizationResponse Execute(OrganizationRequest request)
        {
            if (request.RequestName == "SendAppNotification")
            {
                Notifications++;
                return new OrganizationResponse();
            }
            if (request is UpdateRequest update)
            {
                Update(update.Target);
                return new UpdateResponse();
            }
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
