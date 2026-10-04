# Reusable deployment pattern

**Implemented development proof:** version 0.5.0.0 contains the five-table
foundation plus two disabled manual synthetic message-runtime flows and portable
Outlook/Dataverse connection references. The repository contains the
deterministic schema bootstrap, reviewed managed/unmanaged solution source,
export/build scripts, tests, CI, configuration examples, and an agent skill.

**Not implemented:** the onboarding/review app, independent approval enforcement,
custom security roles, operational mailbox processor/classifier, labels,
reconciliation, monitoring, or production deployment. No live email is being
qualified by this release; the visible category is a bounded proof label.

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
still not a complete message path or
cross-tenant deployment test: the current trusted-header match is bounded to the
observed Microsoft header shape, and shared/all-mailbox access,
excluded-mailbox denial, automatic triggering, and reconciliation remain
unproven.

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
and mailbox/alert settings remain empty. The target now also contains two
disabled manual synthetic proof flows and two tenant-bound connection references.
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
| Apps/automation | Disabled manual synthetic proof flows, portable connection references, and variable definitions; operational app/processor still unbuilt | OAuth connections, operational owner, role assignments, mailbox scope, alert destination |
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

The build validates solution identity, five table roots, the reviewed
manual-only workflow, the two portable connection references, reference-only
User dependency, safe defaults, absence of current values/tenant bindings, and
JSON/XML parsing. It packs managed and unmanaged ZIPs and verifies their actual
manifest managed flags and version. Outputs/hashes are generated under ignored
`artifacts`. Choose a fresh output directory for each repeat build.

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
  --solution-zip .\artifacts\build\MicrosoftTrustedCustomer_0.5.0.0_managed.zip `
  --settings-file .\.local\deployment.local.json

# Populate target-local settings and independently confirm target/scope first.
dotnet tool run pac solution import `
  --environment https://example.crm.dynamics.com `
  --path .\artifacts\build\MicrosoftTrustedCustomer_0.5.0.0_managed.zip `
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

## Manual synthetic runtime proof

The version 0.5.0.0 solution includes two Off, manual-only flows for synthetic
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
