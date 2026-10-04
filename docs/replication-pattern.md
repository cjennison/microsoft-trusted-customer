# Reusable deployment pattern

**Implemented development proof:** version 0.6.0.0 contains the six-table
foundation, two disabled manual synthetic message-runtime flows, one disabled
five-minute shadow flow, portable Outlook/Dataverse/custom Graph connection
references, and the custom Graph connector. The connector source permits only
tenant-supplied client-certificate authentication. The repository contains the
deterministic schema/bootstrap and shadow-flow definitions, reviewed
managed/unmanaged solution source, export/build scripts, tests, CI,
configuration examples, and an agent skill.

**Not implemented:** the onboarding/review app, independent approval
enforcement, custom security roles, accepted operational mailbox classifier,
automatic labels, complete paging/reconciliation, alert delivery, monitoring,
or production deployment. The scheduled flow is Off, has no enrolled mailbox
records, and has not run end to end. No live email is being automatically
qualified by this release; the visible category remains bounded manual proof
evidence.

**Development proof:** the offline synthetic policy and negative scenario tests
are supplemented by a saved manual solution flow. In an authorized customer
development Sandbox, the flow dynamically found the named proof folder and
exactly one `Personal`-categorized synthetic message, requested a Graph
immutable ID, used the message ETag, preserved `Personal`, added the non-positive
MTC category, verified the write, and persisted metadata-only incomplete
assessment state in Dataverse. A second run succeeded and updated the same
assessment row rather than creating a duplicate. A self-addressed message had
already produced two distinct mailbox item IDs with the same Internet Message
ID, demonstrating why processing must key individual messages rather than
conversations. A second manual flow then found exactly one synthetic external
Inbox message, retrieved headers without body or attachments, required exactly
one Microsoft `Authentication-Results` header containing SPF, DKIM, DMARC, and
composite-authentication pass, and confirmed there was no active approved exact
contact. It applied and verified `MTC Proof - not known`, displayed the category
in Outlook web, and persisted one Unrecognized/Aligned pass/Incomplete
assessment. A repeat run reused the same row. Both flows are Off
and have no automatic triggers. A 24-hour exact-address approval was then
created with a fully verified party, contact, evidence reference, current-user
reviewer binding, and verification case. The same retained message changed to
`MTC Proof - known sender`; two runs reused the same assessment row. This is
followed by an accelerated expiry test: the party/contact records were retained
but made expired, and the same message/assessment returned to
`MTC Proof - not known` with Known removed. This is still not a complete message path or
cross-tenant deployment test: the current trusted-header match is bounded to the
observed Microsoft header shape, and automatic triggering and reconciliation
remain unproven.

The live new-designer attempt to compose the second request from the first
action's response was discarded because the expression editor rejected even
trivial valid expressions. The temporary invalid flow was deleted and no
invalid action was saved or run. The portable runtime contract now requires
`Prefer: IdType="ImmutableId"`, exact scope, exactly one item, and `If-Match`
before category PATCH planning. The reviewed manual solution flow now implements
that contract for synthetic proof data; an operational flow or scoped Graph
worker must retain it rather than reverting to static message IDs.
Premium asset execution in that earlier spike was paused because the user's
Developer/premium entitlement had not been verified. An administrator-created
environment and successful technical access are not substitutes for completed
plan enrollment.

**Subsequent customer development setup:** appropriate paid maker/flow-owner
rights were purchased and assigned after exact-order approval, a restricted
Sandbox with Dataverse was created, and the reviewed unmanaged foundation was
imported into the separately authorized commercial-cloud target. The five
custom tables and four definitions were inspected; processing remains Disabled
and mailbox/alert settings remain empty. The target now also contains two disabled manual synthetic proof flows, one disabled scheduled
shadow flow, the paused-by-default mailbox enrollment table, and tenant-bound
connections.
This verifies development behavior, not the managed product, live
classification, or production readiness. Tenant identities, assignments,
hashes, assessment data, and observations are retained privately.

## The repeatable sequence

- **Discover:** verify tenant identity, existing licensing/assignments, capacity,
  environment/region, data policies, Microsoft mail-security baseline, mailbox
  topology, operator ownership, and approval boundaries. Unknown is not ready.
- **Plan:** recommend native security changes first and the smallest justified
  custom route. Record gaps, costs, approved scope, and rollback. Purchases,
  trials/PAYG, production settings, and environment changes need explicit approval.
- **Provision:** choose an authorized development target and create the shared
  solution/schema. Do not put customer constants or records into its source.
- **Implement:** build solution-aware apps/flows, roles, approval policy, exact
  sender/authentication/URL checks, idempotency, failures, and operational controls.
- **Package:** export managed and unmanaged source, review for tenant data,
  build one versioned managed artifact, and retain its SHA-256.
- **Deploy:** create target-local connections, bind configuration, import the
  same managed artifact, and configure scoped roles/ownership/retention privately.
- **Test:** execute the full acceptance matrix with synthetic identities, actual
  supported Outlook clients, failures, revocation, and excluded-mailbox denial.
- **Activate:** shadow first, then visible labels only after the acceptance and
  customer-approval gates. Licensing and operating readiness gate production.
- **Operate/rollback:** monitor coverage and failures, reverify/revoke records,
  disable only the service when necessary, and preserve native protections/data.

The agent execution instructions live in
[deploy-email-qualification](../.github/skills/deploy-email-qualification/SKILL.md).
They can be used for another customer without re-designing the product.

## What is portable, and what is not

| Layer | Portable artifact | Tenant-local work |
| --- | --- | --- |
| Registry | Dataverse table/column/relationship metadata in the solution | Independently verified business records, access teams, evidence and retention |
| Apps/automation | Two disabled manual proofs, one disabled metadata-only shadow flow, portable custom Graph connector/reference, built-in connection references, and variable definitions; operational app still unbuilt | Certificate connection, operational owner, role assignments, mailbox enrollments, alert destination |
| Deployment | The same reviewed managed ZIP and version | Verified target, private PAC deployment settings and approval evidence |
| Microsoft security | A reviewed baseline/configuration procedure | Recipient entitlement, policy precedence, mailbox topology, authorized policy changes |
| Optional Azure | Bicep only if an Azure worker is justified | Subscription/region, scoped identities, monitoring, cost approval |
| Assistant procedure | Repository skill, discovery template, acceptance matrix | Sign-in/MFA, authorization, private evidence and customer handover |

Bicep deploys Azure Resource Manager resources; it is not the packaging format
for Dataverse schemas or Power Apps/Power Automate solutions. No speculative
Azure infrastructure is provisioned by this foundation.

Do not fork the implementation per client. Change shared product code through
versioned releases; use environment variables and connection references for
tenant differences. Existing Dynamics or another registry can later be an
adapter, not an implicit trusted-data source.

## Purchase and development-target gates

When purchasing is authorized, first verify the selected tenant's actual
products and the intended maker's assignments. Another customer's subscriptions,
available trial offers, and administrator access do not establish entitlement.
Use existing appropriate seats before buying new ones.

Record the exact product, quantity, billing term/frequency, estimated taxes,
renewal behavior, assignment target, and checkout total privately. Monthly
billing can still involve an annual commitment; verify subscription length
separately. Obtain exact-order approval, submit each order once, and confirm
both purchase and assignment readback. Do not retry an uncertain purchase
without checking whether the first order succeeded.

License premium app users separately from automated-flow ownership; the future
business administrator's app rights are not covered by a developer's license.
A flow-owner license does not confer access to other mailboxes. See the
[workflow and licensing requirements](email-verification-workflow.md).

If the tenant has only a default environment without Dataverse, do not add a
database to it as an implicit development bootstrap. Seek approval for a separate
Sandbox, region, Dataverse, and scoped development access group. Verify included
capacity and its freshness, then let the actual creation operation enforce
capacity eligibility. Do not activate PAYG, Managed Environments, sample data,
or Dynamics apps to get past a blocker.

Verify explicit group membership, not just ownership, before binding the group
to the environment. Environment group restriction is not a denial of access to
tenant-wide administrators or a replacement for Dataverse roles. Capture the
environment ID/type/region/origin/organization ID independently after creation.

Do not equate a macro region geography with a specific datacenter region.
For example, **North America** permits United States or Canada. Where the
portal offers only macro-region placement, obtain approval for that actual
residency boundary before saving; do not silently broaden a US-only request.
Microsoft's [macro-region guidance](https://learn.microsoft.com/power-platform/admin/macro-regions)
describes specific-region eligibility and the need to verify assigned location
after provisioning. Additional residency purchases need separate approval.

Recheck the final form values after changing type or geography; the portal can
regenerate a default environment name. Verify the actual Dataverse/Managed/PAYG
switch states, group selection, language, currency, and sample-data choices
rather than treating a successful browser click as proof of configuration.

Inspect both legacy data policies and the advanced connector-policy layer for
the target environment. An empty legacy inventory is not proof that every
connector/action is permitted. Record the advanced rule's actual applied state
and any access denial; do not turn on Managed Environments or change a policy
just to inspect or unblock a connector.

## App-only mailbox scope

A maker-owned delegated Outlook connection does not provide tenant-wide mailbox
access. In the development tenant, it returned `404 itemNotFound` for both shared
mailboxes because the operator was not an existing Full Access delegate.
Granting the developer Full Access to every mailbox is not the supported
all-mailbox architecture.

For authorized all-mailbox processing, use a dedicated single-tenant Entra
application and Exchange Online RBAC for Applications:

1. Create a certificate credential. Development can use a non-exportable local
   certificate; production should use approved managed certificate storage and
   rotation.
2. Keep Microsoft Entra API permissions empty for mail. Do not add tenant-wide
   `Mail.ReadWrite`; Entra and Exchange grants are additive, so an unscoped
   Entra grant defeats Exchange resource scoping.
3. In Exchange, create the service-principal pointer with the Entra application
   ID and **enterprise application service-principal object ID**.
4. Assign `Application Mail.ReadWrite`, which permits mail read/category update
   but does not include Mail.Send.
5. Restrict it with a management scope. For automatic current/future coverage:

   ```powershell
   New-ManagementScope -Name 'MTC All User and Shared Mailboxes' `
     -RecipientRestrictionFilter "RecipientTypeDetails -eq 'UserMailbox' -or RecipientTypeDetails -eq 'SharedMailbox'"

   New-ManagementRoleAssignment `
     -Name 'MTC Mailbox Processor Mail.ReadWrite All Mailboxes' `
     -Role 'Application Mail.ReadWrite' `
     -App VERIFIED_SERVICE_PRINCIPAL_OBJECT_ID `
     -CustomResourceScope 'MTC All User and Shared Mailboxes'
   ```

6. Before broad enrollment, use a direct-membership mail-enabled security-group
   scope to prove an included mailbox succeeds and an excluded mailbox returns
   HTTP 403. Nested members do not count.
7. Verify Exchange configuration with `Test-ServicePrincipalAuthorization`, then
   verify actual Graph data-plane access using app-only certificate
   authentication. Allow for authorization propagation after scope changes.

Copy `config\mailbox-processor.example.json` to a private `.local` file and run:

```powershell
.\scripts\Test-MailboxProcessorAccess.ps1 `
  -ConfigurationFile .\.local\mailbox-processor.local.json
```

The validator expects HTTP 200 for allowed mailboxes and HTTP 403 for excluded
mailboxes. App IDs, certificate thumbprints, mailbox addresses, authorization
results, and certificate material remain tenant-local.

The development tenant proved this path with a certificate-authenticated app
that had no Entra API permissions and only Exchange
`Application Mail.ReadWrite`. Both shared mailboxes returned HTTP 200; a
temporarily excluded user mailbox returned HTTP 403. Exact immutable synthetic
messages in both shared mailboxes were categorized Not known with ETag
concurrency, unrelated categories were preserved, and repeat processing reused
one category and one assessment row per message. After about 55 minutes of
Exchange data-plane propagation, the permanent UserMailbox/SharedMailbox scope
returned HTTP 200 for all 12 current mailboxes. The temporary proof group,
scope, and assignment were then removed.

The same tenant also proved the Power Platform transport: a private custom
connector connection using Client Certificate Auth returned Graph HTTP 200 for
a shared mailbox through the Exchange-RBAC-only application. The solution now
packages the connector and its connection reference. Public connector source
contains no tenant/application identifiers and exposes only tenant-supplied
client ID, tenant ID, and PFX certificate fields. Imported solutions still
require a target-local certificate connection and binding; no certificate,
password, or connection instance is transported in the solution.

## Bootstrap development

Prerequisites: Node.js 22+, PowerShell 7, .NET 10 SDK for the pinned PAC tool,
and an installed Vercel `agent-browser` with its local browser available.
Bootstrap supports commercial-cloud Sandbox/Developer environments only.
Developer/trial access does not establish production licensing.
The free Developer Plan applies only to Developer environments, not an existing
Sandbox. Verify the actual user's enrollment/assignment, not another account's
license or the administrator's ability to provision an environment. If approved
self-service enrollment cannot complete, record the blocker and continue only
with offline work. Do not change tenant licensing/consent policies, reset another
account, or toggle administrator provisioning options as a workaround.

```powershell
dotnet tool restore
npm test

New-Item -ItemType Directory -Path .\.local -Force | Out-Null
Copy-Item .\config\development.example.json .\.local\development.local.json
agent-browser --session mtc-client-development --headed open https://make.powerapps.com
```

Sign in manually, confirm the tenant
and approved environment in the admin center, and open the actual Dataverse
application URL in the same isolated browser. Use `agent-browser ... tab list`
to identify its stable tab ID. Populate the private configuration with the
verified HTTPS origin, organization ID, environment type, isolated browser
namespace/session, tab, and explicit authorization. The browser job supports a
globally installed `agent-browser` or the pinned npx fallback without exporting
browser state. Organization ID is not the Power Platform environment ID or
Entra tenant ID; verify each independently.

```powershell
.\scripts\Initialize-Development.ps1 -ConfigurationFile .\.local\development.local.json
```

The script uses the normal signed-in Dataverse application's same-origin Web
API session. It does not extract bearer tokens or use stored browser cookies.
It refuses the wrong origin/organization, production, placeholders, duplicates,
and conflicting schema. Only an actual 404 permits missing-metadata creation;
401/403/429/5xx surface as errors. A rerun verifies and retains existing schema;
it is not a destructive schema migration tool.

The browser job is pinned to the configured tab. Do not navigate/close that
tab while it runs. If the shell fails, inspect `globalThis.MtcProvisioningJob`
in that tab before retrying; server-side components can outlive a failed shell.
Partial components are retained, not silently erased.

### Foundation schema

The solution contains BusinessParty, ApprovedDomain, ApprovedContact,
VerificationCase, and MessageAssessment, with parent/contact/reviewer lookups.
All custom tables are user-owned.
Deleting referenced parties/reviewers is restricted; relationships do not
cascade deletions or sharing.

Verification form choices default to **Pending**; assessment form dimensions
default to **Incomplete**. These are form defaults, not guaranteed defaults
for arbitrary Web API inserts. Future writers must explicitly set initial
states; missing/null states can never grant positive qualification.
Audit metadata is enabled on custom tables, but effective
organization auditing/retention must be separately verified and authorized.
Application-required columns are not server-side security or approval rules.
No end-user roles are granted by bootstrap.

| Definition | Portable default |
| --- | --- |
| `mtc_ProcessingMode` | `Disabled` |
| `mtc_PilotMailbox` | Empty |
| `mtc_OperatorAlertDestination` | Empty |
| `mtc_PolicyVersion` | `1` |

There is no operational or automatically triggered processor to enable yet; the
manual synthetic proof does not read these values. These definitions are the
future configuration contract, not proof of a functioning runtime or a
sufficient kill switch by themselves. Keep current values out of this publicly
exported development solution.

## Export and build

The pinned CLI is in `.config/dotnet-tools.json`. Both exports are required;
do not manufacture managed metadata by hand or package unmanaged source as a
production solution.

```powershell
.\scripts\Export-DevelopmentSolution.ps1 `
  -ConfigurationFile .\.local\development.local.json `
  -OutputDirectory .\artifacts\export
.\scripts\Export-DevelopmentSolution.ps1 `
  -ConfigurationFile .\.local\development.local.json `
  -OutputDirectory .\artifacts\export -Managed

dotnet tool run pac solution unpack `
  --zipfile .\artifacts\export\MicrosoftTrustedCustomer.zip `
  --folder .\.local\review-solution --packagetype Both
```

Review the private unpacked source before updating `solutions\MicrosoftTrustedCustomer`.
The export guard rejects current values for the four known definitions; it is
not a general secret scanner. Review every new component, connection ID,
environment constant, user/team assignment, and dependency. Solution metadata
IDs and reference-only built-in User metadata are portable, not customer records.

The checked-in source is the reviewed dual-format export. To rebuild it:

```powershell
.\scripts\Build-Solution.ps1
```

Reviewed 0.6.0.0 development build:

- Unmanaged SHA-256:
  `24A1BC7DF2A86EE947CC72F1C60446A9FBE09EB73AFD067A3D34F5AF4BCCBE19`
- Managed SHA-256:
  `F82FD4C47E654BDE8EC33D3B6583752DC19F3AF36104A1DAF01A3DD12DE5B659`

The build validates solution identity, six table roots, both manual proofs, the
disabled scheduled shadow flow, the certificate-only custom connector, three
portable connection references, reference-only User dependency, safe defaults,
absence of current values/tenant bindings, and JSON/XML parsing. It also
requires that the shadow flow has no category-write operation and only records
presentation as Not attempted. It packs managed and unmanaged ZIPs and verifies
their actual manifest managed flags and version. Outputs/hashes are generated
under ignored `artifacts`. Choose a fresh output directory for each repeat
build.

The solution source validator intentionally describes this release's scope.
When adding apps/flows/connection definitions or changing defaults, review and
update its contract and tests as part of the feature; don't bypass it.
CI produces the two ZIPs as build artifacts, not approved production releases.

## Another customer's deployment

Use `config\client.example.json` in private approved storage to record discovery
and gate evidence. Default all gates to unknown/not started. For a product
deployment, create test/pilot resources with authorization, then import the same
managed release instead of rerunning the development bootstrap on production.

The development proof can be imported into an approved test environment, but
doing so does not deploy the unimplemented application/processor or prove
cross-tenant operation.
The separately authorized customer-development import used the unmanaged
foundation for shared-source feature development. No second-tenant managed
product import or complete live-email acceptance testing is claimed.

For a reviewed release, the supported PAC commands are:

```powershell
# PAC authentication is separate from the browser's sign-in.
# Verify and use a customer-specific profile; never change another session's profile.
# Device-code sign-in may be blocked by Security Defaults or Conditional Access.
# Use an allowed interactive flow instead; never weaken MFA policies for deployment.
dotnet tool run pac auth create --name CUSTOMER_TEST `
  --tenant VERIFIED_TENANT_GUID --environment https://example.crm.dynamics.com --deviceCode

dotnet tool run pac solution create-settings `
  --solution-zip .\artifacts\build\MicrosoftTrustedCustomer_0.6.0.0_managed.zip `
  --settings-file .\.local\deployment.local.json

# Populate target-local settings and independently confirm target/scope first.
dotnet tool run pac solution import `
  --environment https://example.crm.dynamics.com `
  --path .\artifacts\build\MicrosoftTrustedCustomer_0.6.0.0_managed.zip `
  --settings-file .\.local\deployment.local.json
```

Keep processing disabled and flows off. Do not use force overwrite, dependency
skips, or blanket workflow activation. Schema import does not create OAuth
connections, license users, configure Microsoft security, transfer Dataverse
business records, or enforce independent approval.

Production is blocked until the missing product components and every agreed
gate in the [pilot plan](pilot-plan.md) are implemented and evidenced. First
validate the trusted authentication/header/category path; do not replace it
with an optimistic demo that mislabels messages.

## Offline proof policy

`src\qualification\proof-policy.js` is a bounded, synthetic-only proof policy,
not a production classifier. Run its scenarios with `npm test`; no tenant
credentials or license enrollment are required for these local tests.

`src\registry\verification-policy.js` is the corresponding offline
verification-transition contract. It authorizes actions from trusted caller
context rather than command-supplied identities, supports explicit
single-registrar and independent-review modes, normalizes exact contact/domain
targets, rejects wholesale consumer-domain approval, requires evidence and a
future expiry, and server-stamps approval/rejection/revocation audit events.
It is not yet wired to Dataverse plug-ins, custom APIs, security roles, or the
administrator app, so it cannot authorize a live registry record.

- Fixture recognition requires an exact approved identity, current verification
  and expiry timestamps, and explicit independent-verification evidence.
  The default independent-review mode requires distinct requester/reviewer IDs.
  An explicit `registry.verificationAuthority` can select `single-registrar`
  with `authorizedRegistrarIds`; only listed verifiers are eligible, including
  when creating their own entries. Multiple verifiers are supported. This
  fixture configuration is not server-side role enforcement, and captured mail
  still cannot receive a live Known category under either mode.
  Consumer provider domains cannot grant wholesale recognition.
- Missing, failed, conflicting, expired, revoked, or ambiguous identity evidence
  produces **Not known**. Known requires an active exact address/domain match
  plus aligned trusted authentication.
- The fixture entry point requires `fixture: true`. Its Known presentation
  cannot pass the live category-writing helper.
- The captured-message entry point does not accept header text or an input
  authentication flag as trusted evidence. It always records
  `RECEIVING_BOUNDARY_NOT_VALIDATED`; no live positive labels are possible.
- The category helper preserves unrelated categories, removes prior MTC-owned
  proof labels, and permits only `MTC Proof - not known` for captured messages.
- Mailbox/folder/subject-marker scope and stable message identifiers are
  mandatory. Malformed registry structures throw explicit errors; they
  are not silently ignored or converted into successful assessments.

The policy currently accepts curated, structured fixture evidence; it does not
validate real authentication headers, enforce Dataverse approval permissions,
or implement durable retries. Local fixture results cannot satisfy the manual
live acceptance or production gates.

## Manual and shadow runtime proof

The version 0.6.0.0 solution includes two Off, manual-only flows for synthetic
development evidence. The immutable category/persistence flow:

- Finds the exact `MTC-Proof` folder and requires exactly one proof message with
  the unrelated `Personal` category and subject marker.
- Requests `Prefer: IdType="ImmutableId"`, uses the item ETag in `If-Match`,
  preserves existing categories, and verifies the non-positive category write.
- Lists `MessageAssessment` rows by mailbox reference plus immutable ID and
  fails if more than one exists.
- Creates or updates one metadata-only assessment with relationship,
  authentication, and risk states explicitly `Incomplete`.
- Records processing and presentation success separately; message bodies,
  attachments, sender addresses, and customer records are not persisted.

Two consecutive observed runs reused one assessment row. The external
authentication/unrecognized-presentation flow:

- Requires exactly one Inbox message with the synthetic external subject and
  retrieves its immutable ID, categories, sender metadata, and internet headers
  without requesting body or attachments.
- Requires exactly one Microsoft `Authentication-Results` header beginning with
  the observed `mx.microsoft.com` auth service marker and containing SPF, DKIM,
  DMARC, and composite-authentication pass.
- Lists active approved contacts and parties, requires complete evidence,
  verification timestamps, future expiry, and exactly one matching party/contact
  pair, then chooses Known; zero valid matches chooses Not known.
- Removes prior MTC-owned labels, applies and verifies either
  `MTC Proof - known sender` or `MTC Proof - not known` while preserving other
  categories, then persists the relationship and authentication dimensions.
- Fails closed on message, trusted-header, registry, assessment, or category
  readback ambiguity. Two observed runs reused one assessment row, and Outlook
  web visibly displayed the category.
- On accelerated party/contact expiry, the same immutable message and assessment
  row returned from Known to Not known without deleting the expired records.

The third flow is a five-minute recurrence that also exports Off. It:

- Selects only active `MailboxEnrollment` rows explicitly set to Enrolled; new
  rows default to Paused and Not started.
- Uses the app-only custom Graph connection to list Inbox messages with a
  ten-minute initial overlap and immutable IDs, then fetches message metadata
  and internet headers without bodies or attachments.
- Evaluates the bounded trusted Microsoft authentication shape, active exact
  contact first and exact domain second, plus the matched party evidence and
  expiry.
- Creates or updates one metadata-only assessment per mailbox and immutable
  message ID with presentation status Not attempted.
- Contains no category update operation or Known/Not known Outlook label text.
- Does not advance the checkpoint when Graph returns `@odata.nextLink`, when
  duplicate assessments exist, or when processing fails; mailbox health retains
  an operator-visible failure and run history remains required.

No mailbox is enrolled and no scheduled run has been accepted. Paging,
throttling/retry policy, alert delivery, generalized authentication parsing,
and reconciliation still gate activation.

A Dataverse connection
attempt in run-only invoker context failed Unauthorized before record creation;
the reviewed flows therefore use the tenant-bound Dataverse connection reference
in embedded owner context while retaining the Outlook run-only connection for
manual proof execution. This does not establish the future operational ownership
model. The current header match and 100-row contact listing are bounded proof
logic, not the final parser/query design. Automatic triggering, shared mailboxes,
excluded-mailbox denial, failure reconciliation, and expiry/revocation-triggered
reassessment remain blocked.

## Official platform references

- [Solution-based ALM](https://learn.microsoft.com/en-us/power-platform/alm/solution-concepts-alm).
- [Connection references and environment-variable deployment settings](https://learn.microsoft.com/en-us/power-platform/alm/conn-ref-env-variables-build-tools).
- [Create table metadata with the Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api).
- [ExportSolution action](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolution).
- [PAC solution commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution).
- [Power Platform pipelines and licensing](https://learn.microsoft.com/en-us/power-platform/alm/pipelines).
