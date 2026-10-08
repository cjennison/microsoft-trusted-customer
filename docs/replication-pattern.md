# Reusable deployment pattern

**Implemented development MVP:** version 0.9.1.0 contains the six-table
foundation, two disabled manual synthetic message-runtime flows, a five-minute
shadow worker, a separately authorized Outlook presentation worker, portable Outlook/Dataverse/custom Graph connection
references, and the custom Graph connector. The connector source permits only
tenant-supplied client-certificate authentication. The repository contains the
deterministic schema/bootstrap and shadow-flow definitions, reviewed
managed/unmanaged solution source, export/build scripts, tests, CI,
configuration examples, and an agent skill.

The solution now also includes the published **Sender Registry** model-driven
app, twelve caller-context custom APIs, the signed registrar plug-in assembly,
fourteen synchronous registry write/relationship guards, unique address/domain/
mailbox keys, and separate `MTC Registrar`/`MTC Operator` roles. Guided synthetic
Verify/Renew/Revoke operations were exercised in the actual app. Live exact-domain
verification/revocation, immutable event data, actual-caller stamping, and
negative approval scenarios also passed. The mailbox-health view decodes the
published Dataverse choice values (100000000 through 100000003) into Not started,
Healthy, Degraded, and Failed. Missing or unsupported values remain Unknown,
never an inferred healthy status. The corrected published app was observed
showing the actual healthy backend state.
Existing authorized user/shared mailbox
records have completed an explicitly authorized metadata-only shadow pilot.
The worker follows exact Graph pagination links through a metadata/mailbox/origin
guard, leases each scan, uses captured cutoffs with overlap, and reacts to registry
changes and due expiry within an approved 30-day window. In-app operator alerts
were delivered and are visible in the actual registry app.

**Not activated/accepted:** live independent-review mode, tenant-wide automated
Outlook category execution, customer-client coverage and final operational
handover, or production deployment. The shadow worker is running in the approved
development pilot; the separate presentation worker is Off and labeling mode is
Disabled. A specifically authorized retained synthetic message demonstrated
Known and revocation back to Not known through current server planning,
ETag writes, exact readback, and actual Outlook web presentation. Its sender
approval was left Revoked and labeling was restored Disabled after the proof.
The actual enabled Power Automate worker subsequently passed a separately
authorized one-message Known/revocation/Not-known test through the real
certificate connector. Both native runs succeeded and both categories were
observed in Outlook web. The original worker definition was restored Off with
labeling Disabled and the test contact Revoked.

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
cross-tenant deployment test: the trusted-header policy is bounded to supported
Microsoft receiving evidence. Subsequent shadow automation and reconciliation
are described above; a scoped enabled presentation proof has since passed.
Wider mailbox/client and production acceptance remain separate.

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
imported into the separately authorized commercial-cloud target. At that
foundation stage, five custom tables and four definitions were inspected,
processing was Disabled, and mailbox/alert settings were empty. Later releases
added paused-by-default enrollment, registrar controls, and the authorized
shadow pilot described above.
This verifies development behavior, not a second-tenant managed deployment or
production readiness. Tenant identities, assignments,
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
| Apps/automation | Sender Registry app, protected custom APIs, signed plug-in, registrar/operator/processor roles, two disabled manual proofs, disabled-by-default shadow and presentation workers, Graph connector/code and variable definitions | Certificate connection, licensed app users, role assignments, operational owner, mailbox enrollments, alert recipient and separate labeling approval |
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
VerificationCase, MessageAssessment, and MailboxEnrollment, with
parent/contact/reviewer lookups.
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
| `mtc_LabelingMode` | `Disabled` |
| `mtc_PilotMailbox` | Empty |
| `mtc_OperatorAlertDestination` | Empty |
| `mtc_PolicyVersion` | `1` |
| `mtc_RequiredRegistrarFields` | Empty (all optional) |

The shadow runtime reads processing mode, policy version, and alert destination;
enrollment rows define its authorized mailbox scope. The presentation runtime
uses the independent labeling gate. The earlier manual synthetic proofs do not
read these settings and must remain Off. Definitions alone do not activate the
service. Keep current values out of publicly exported solution source.

### Per-client registrar field requirements

Agree with each client, at setup, which verification details registrars must
record, then set `mtc_RequiredRegistrarFields` to a comma-separated list of
`VerificationMethod`, `EvidenceReference`, and `ExpiresOn` (empty = all
optional). Record the choice in the private client decision record
(`registrarRequiredFields`). The same release serves every client:

- The `mtc_VerifySender` plug-in rejects an approval that omits a listed field.
  The three API parameters are optional at the platform level so the setting,
  not the schema, decides.
- Known matching requires listed fields on the registry entry. If a client later
  adds a requirement, existing entries without that field stop being Known until
  a registrar renews them, so plan renewals before tightening.
- A blank expiry means the approval does not expire; revocation still works.
- An invalid value fails closed (approvals and matching stop with an operator
  error). If the definition is missing, all three are required.
- The Sender Registry app reads the same setting and marks fields "(optional)";
  the server remains authoritative.

## Export and build

### Registrar app development

The live app currently supports only explicitly selected single-registrar
operation. Do not use it as an independent-review implementation. Restore the
reviewed .NET dependencies by building the plug-in after its manifest changes.
The JavaScript/app implementation has no npm dependencies.

```powershell
npm test
.\scripts\Test-RegistrarPlugin.ps1
.\scripts\Build-RegistrarPlugin.ps1
.\scripts\Deploy-Registrar.ps1 `
  -ConfigurationFile .\.local\development.local.json `
  -VerificationAuthorityMode single-registrar
```

`Test-RegistrarPlugin.ps1` builds unsigned test binaries into ignored artifacts;
it does not need a publisher private key and does not replace the signed
deployment output. `Build-RegistrarPlugin.ps1` requires the approved publisher
signing key in restricted, Git-ignored storage and forces a signed rebuild.
For a genuinely new publisher only, `-CreateSigningKey` explicitly generates
the initial key. Do not generate a different signing identity per customer.
Neither the private key nor test binaries belong in the public solution.

`Deploy-Registrar.ps1` verifies the approved commercial-cloud origin and exact
organization, rejects Production, stages the app and API/guard metadata, and
does not activate any flow. `-AssignCurrentUser` additionally assigns the
authenticated operator the dedicated roles; use it only after that actual
operator's licensing and authority are verified. Other app users need separately
verified entitlements, Basic User/platform access, and tenant-local role
assignments. The dedicated roles retain Dataverse's automatically supplied
minimum platform privileges; they do not grant Graph mailbox access.

Copy `config\mailbox-enrollment.example.json` into private approved working
storage, populate the authorized existing user/shared inventory, and run:

```powershell
.\scripts\Onboard-DevelopmentMailboxes.ps1 `
  -ConfigurationFile .\.local\development.local.json `
  -MailboxInventoryFile .\.local\mailbox-enrollment.local.json
```

This creates only Paused enrollment records through the operator API. It
rejects duplicate/conflicting records rather than implicitly pausing an active
mailbox or changing its type. It does not create Microsoft 365 users, grant mail
permissions, or turn processing on.

### Authorized shadow runtime

The paged transport adds `ListMailboxMessages` and the reviewed
`src\runtime\graph-paging.cs` connector script. It accepts only the exact Graph
HTTPS origin, the same mailbox message collection, and approved metadata fields;
it forwards the server's exact next link and enforces immutable IDs. Validate
the script locally, update/publish it through the supported connector editor if
compute provisioning rejects the Web API attempt, and prove a real next-page
read with the target certificate connection.

```powershell
.\scripts\Initialize-Development.ps1 `
  -ConfigurationFile .\.local\development.local.json -PreserveOperationalSettings
.\scripts\Build-RegistrarPlugin.ps1
.\scripts\Deploy-Registrar.ps1 `
  -ConfigurationFile .\.local\development.local.json `
  -VerificationAuthorityMode single-registrar
.\scripts\Deploy-MailboxRuntime.ps1 `
  -ConfigurationFile .\.local\development.local.json
```

`-PreserveOperationalSettings` is an explicit development migration option. It
preserves existing tenant current values, rather than resetting a running pilot,
and does not relax target identity, development-type, or export/source guards.
Normal bootstrap/export still rejects current-value-bearing public source.

Only after shadow scope/window/alert approval, use the private authorized
certificate mailbox inventory with `Configure-ShadowPilot.ps1 -EnableShadow`.
It resolves native outbound/deleted folder IDs, enrolls only the approved rows,
and binds in-app alerts to the current operator. It does not authorize visible
labels. The separately deployed presentation worker remains Off until its actual
enabled path and customer-client scenarios pass and separate approval is recorded.

For an active development pilot, use `Export-DevelopmentSolution.ps1
-PrivateReview` only under ignored `.local`. These archives may contain actual
current settings and On-state metadata. Omit current values/auth bindings and
normalize portable flow metadata Off before copying reviewed source. Do not
clear live tenant settings or pause another process merely to satisfy an export.

### Portable solution artifacts

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
The export guard rejects current values for the five known definitions; it is
not a general secret scanner. Review every new component, connection ID,
environment constant, user/team assignment, and dependency. Solution metadata
IDs and reference-only built-in User metadata are portable, not customer records.

The checked-in source is the reviewed dual-format export. To rebuild it:

```powershell
.\scripts\Build-Solution.ps1
```

The previously recorded 0.6 artifacts are superseded and must not be deployed:
the old build did not verify the custom connector was embedded in
`customizations.xml`. The build now checks its actual customization metadata and
all referenced connector payloads, not just the presence of loose ZIP files.

Reviewed 0.9.0.0 development build (not production acceptance):

- Unmanaged SHA-256:
  `53A00B0F84E7E44394F746C4D35EB0717521471DAE16A2A33118CAF53358BF5B`
- Managed SHA-256:
  `05FE77677248791EB228D4A7A9F00C4108E0A41CFB28F8AFF4915D3024AB479C`

These identify the retained reviewed archives, not every rebuild. ZIP container
bytes and hashes can differ between builds; choose one reviewed artifact and
reuse its exact bytes across deployments rather than treating the version as a
hash guarantee.

Reviewed 0.9.1.0 colored-label development build (not production acceptance):

- Unmanaged SHA-256:
  `B328D44EEA7910563DF6ED257BAA69DE18C5669D72E73B038AF2A283BC1A32E3`
- Managed SHA-256:
  `2830BA25ACD4A5EEB4A7BA049B9375DD3D820F6F19EF765F5CDE32CA4225B621`

The signed exported assembly matches the signed source build. The release
retains the reviewed portable connector authentication and Off/default-disabled
metadata; private current values and mailbox category settings are not included.

The build validates solution identity, six table roots, both manual proofs, the
disabled scheduled shadow and presentation flows, the app, registrar assembly/APIs/roles/guards,
the certificate-only custom connector, three
portable connection references, reference-only User dependency, safe defaults,
absence of current values/tenant bindings, and JSON/XML parsing. It also
requires that the shadow flow has no category-write operation and only records
presentation as Not attempted, and that presentation retains its independent
authorization, fresh immutable reads, ETag writes, exact readback, and failure
notification path. It packs managed and unmanaged ZIPs and verifies
their actual manifest managed flags, version, and actual embedded connector. Outputs/hashes are generated
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

The development release can be imported into an approved test environment, but
doing so does not bind tenant-local connections, authorize automation, or prove
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
  --solution-zip .\artifacts\build\MicrosoftTrustedCustomer_0.9.1.0_managed.zip `
  --settings-file .\.local\deployment.local.json

# Populate target-local settings and independently confirm target/scope first.
dotnet tool run pac solution import `
  --environment https://example.crm.dynamics.com `
  --path .\artifacts\build\MicrosoftTrustedCustomer_0.9.1.0_managed.zip `
  --settings-file .\.local\deployment.local.json
```

Keep processing disabled and flows off. Do not use force overwrite, dependency
skips, or blanket workflow activation. Schema import does not create OAuth
connections, license users, configure Microsoft security, transfer Dataverse
business records, or enforce independent approval.

Production is blocked until automatic presentation and every agreed
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
administrator app. Live MVP approvals use the separately deployed custom APIs
and registry guards, not this fixture entry point.

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

The version 0.9.1.0 solution includes two Off, manual-only flows for synthetic
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
- Uses the app-only custom Graph connection to list metadata and headers across
  delivery folders, excluding Sent Items, Drafts, Outbox and Deleted Items, with
  a captured upper cutoff and ten-minute overlap. First scans and registry
  reassessment use the approved 30-day window.
- Evaluates the bounded trusted Microsoft authentication shape, active exact
  contact first and exact domain second, plus the matched party evidence and
  expiry.
- Creates or updates one metadata-only assessment per mailbox and immutable
  message ID with presentation status Not attempted.
- Contains no category update operation or Known/Not known Outlook label text.
- Persists each complete page and follows the exact next link under an origin,
  mailbox and metadata-only guard. The final page advances the delivery cutoff.
  Failure stops the Until loop, preserves the unfinished cursor, and notifies
  the configured operator without an optimistic completion claim.
- Uses deterministic GUID keys for case-sensitive Graph IDs. Dataverse text
  equality is case-insensitive, so legacy lookup candidates are narrowed by
  ordinal message-ID matching before any cardinality decision.

The development shadow pilot completed all approved mailboxes and subsequent
scheduled runs. A real text-collation conflict and a non-terminating failed-page
loop were observed, fixed, regression-tested, and resumed from the retained
cursor. Live ownership renewal caused retained messages to become Known
candidates; revocation queued reassessment without resend.

The fourth flow is an independent presentation worker. It exports Off and checks
`mtc_LabelingMode` before enumerating pending assessments. Current message reads,
current registry/authentication planning, exact owned-category replacement,
ETag writes, and current-eligibility readback use the same processor identity.
The single-message proof passed these server APIs plus app-only Graph transport
and Outlook web observation. The actual enabled worker subsequently passed the
same Known/revocation/Not-known transition through the certificate connector.
Both native Power Automate runs succeeded, server-side readback succeeded, and
both states were visible in Outlook web.

For this bounded acceptance, the real worker's assessment query was temporarily
narrowed to exactly one authorized assessment while it was Off. Every transport,
planning, write and readback action was retained; `body/categories` was exercised
through the actual connector rather than replaced with a direct Graph write.
The test renewed the owner-confirmed exact address for 24 hours, ran Known,
revoked it through the protected API, and ran Not known on the same retained
immutable email. No other message was eligible for the presentation query.
After successful runs, labeling was Disabled first, the presentation worker was
turned Off, and only then was its exact original definition restored.

`Pilot` authorizes presentation; it is not a one-message or one-mailbox
allowlist. Both modes now use the same current names. Do not enable the
unmodified worker under a narrower authorization
than its pending-assessment query. Save the original definition and private
scope/restoration evidence before a bounded test, confirm no active presentation
run before restoring the broader query, and leave native protections and the
separately authorized shadow pilot unchanged. This transport proof does not
accept the wider negative/failure matrix, other Outlook clients, or production.

### Clear labels and mailbox-local colors

Version 0.9.1.0 uses `✓ Known sender` and `Unknown sender` in both authorized
modes; version 0.9.12.0 shortens the Known label to a blue `✓` and keeps
`✓ Known sender` as an owned alias that reconciliation removes. Renaming a label
needs a new mailbox master category (Graph cannot rename one), so it repeats the
temporary scoped `MailboxSettings.ReadWrite` setup below: create the new blue
category, relabel, delete only the recorded old category, then remove and
verify revocation of the permission. The internal Not known decision and receiving-authentication/approval
policy are unchanged. Four legacy MTC category names are removed only during
exact service-owned reconciliation; unrelated categories are preserved.

Before visible activation, inspect each approved mailbox's master category list.
Check exact-name ownership before creating categories; stop on an unrelated
existing-name collision rather than taking it over. In native Outlook category
settings, create the checkmark name with blue and Unknown sender with gray.
Outlook web calls the observed presets Sky blue and Silver. These settings are
mailbox-local and are not copied by a solution import. Automating them through
Graph requires separately approved `MailboxSettings.ReadWrite`; do not add an
unscoped Entra grant or assume `Mail.ReadWrite` covers category administration.

The operator-mailbox proof created both categories through native settings,
ran the real scoped worker to Known, revoked the exact test contact, and ran it
back to Unknown. Both native runs and server readbacks succeeded. Outlook web
showed the checkmark, blue/gray backgrounds, and removal of the prior legacy
label. The test left the contact Revoked and restored the exact original worker
Off with labeling Disabled; the authorized all-mailbox shadow pilot remained
healthy. Private scope, rendering and restoration evidence stays outside Git.
Desktop/mobile/shared-mailbox color behavior and wider activation remain gated.

For an explicitly authorized multi-mailbox setup, Exchange application RBAC
supports `Application MailboxSettings.ReadWrite` with an exact mailbox resource
scope. Prefer a temporary assignment covering only the approved current
inventory, not an unscoped Entra application grant. The permission can modify
other mailbox settings as well as category definitions, so keep the setup code
restricted to the two exact service categories and remove the assignment/scope
after setup, including after a failed attempt.

Preview the scope against actual recipients and verify certificate/tenant/
application identity. Read every category inventory before creating anything;
stop on existing-name ownership ambiguity. Keep progress and created category
IDs private so an interrupted attempt is inspected before retrying. Successful
master-category setup does not authorize message labeling or production.

`Test-ServicePrincipalAuthorization` bypasses the Exchange permission cache;
InScope=True is control-plane evidence, not proof the category API works.
Actual permission changes can take 30 minutes to two hours. Confirm real Graph
category reads/writes/readbacks, remove only the recorded temporary role/scope,
then verify real category reads are denied across the approved inventory.
Removal readback alone is not effective-revocation evidence. Do not pause the
working shadow pilot or add broad permissions merely to clear cached 403s.
A bounded attached setup/cleanup job must remain supervised through cleanup;
do not claim completion while it is waiting for propagation or denial.

The approved current inventory's setup has since completed with exact category
and color readbacks. The temporary assignment/scope was removed, and fresh
certificate category reads denied access across that inventory. This accepts
permission cleanup and master-category setup, not wider visible presentation.

The initial MVP target is Outlook web. Other clients remain a separate future
scope, while user/shared-mailbox web coverage remains required before wider
activation.

Shared-mailbox Outlook web acceptance also requires an explicitly authorized
human delegate. App-only processing access does not confer human Full Access.
Keep delegation restricted to the agreed shared mailboxes, preserve existing
delegates, and do not add Send As or Send on Behalf just to view the proof.
Record whether the approved human access is temporary or permanent; test
cleanup must not remove explicitly approved permanent delegation.

### Presentation failure and recovery acceptance

The real one-message worker also passed controlled failure injection without
renewing its revoked contact or allowing Known presentation:

- A changed category set with a stale `If-Match` returned HTTP 412/
  `PreconditionFailed`. The write failed, dependent readback actions were skipped,
  presentation was marked failed, and the existing Unknown label was unchanged.
- An incorrect expected category set caused exact-readback verification to fail.
  The correct no-op plan skipped PATCH; no Known label was written.
- The operator's actual registry notification panel displayed the category
  failure. A repeated failure in the same mailbox within the one-hour alert
  window was deduplicated while the new failed assessment/run remained visible.
- Removing the injected faults and rerunning the unchanged scoped worker
  produced successful fresh planning/readback and successful presentation status.
  No category write was needed because Unknown already matched the current rule.
- The test restored labeling Disabled, stopped the worker, verified stop
  completion, and restored its exact original definition. The contact stayed
  Revoked, Unknown stayed visible, and the independent shadow pilot stayed healthy.

Conditional-write acceptance must attempt a real, non-positive service-owned
category delta. A stale-header PATCH with an unchanged category set was accepted
as a no-op during the initial probe; that is not evidence of either successful
stale-write rejection or an unsupported concurrency guard. Verify the actual
connector response status, failed action, durable state, alert visibility and
unchanged category, rather than treating an overall failed/succeeded run as enough.

The readback test deliberately supplied a wrong expectation; it was not a real
customer outage or spontaneous message race. Historical notifications are not
automatically cleared by successful recovery: inspect the latest run and
assessment before treating an old failure notification as current state. Retain
fault variants and actual scope/run evidence privately, not in portable source.
Broader outage, client, workload and production acceptance remain separate gates.

A Dataverse connection
attempt in run-only invoker context failed Unauthorized before record creation;
the reviewed flows therefore use the tenant-bound Dataverse connection reference
in embedded owner context while retaining the Outlook run-only connection for
manual proof execution. This does not establish the future operational ownership
model. The old manual proof header match and 100-row contact listing remain
bounded proof logic. The new runtime uses exact per-identity registry queries,
counts all receiving Authentication-Results headers, validates the exact
Microsoft marker/version and receiving-source/direction boundary, requires exact
DMARC From alignment and supported sender/Reply-To identity, and fails closed on
missing, duplicate, failed or unsupported evidence. Broader forwarding/internal
message support is not implicitly accepted by the MVP.

## Registrar group and Outlook "Verify sender" button

Grant registrar access through one Entra security group rather than per-user
roles. Bind it to a Dataverse group team holding `MTC Registrar` plus the
built-in `Basic User` role; the protected APIs accept team-inherited roles and
still stamp the actual caller. `MTC Registrar` grants only registry access, not
the platform privileges an app needs, so without `Basic User` a non-admin
member gets HTTP 403 `prvReadWebResource` when opening the registry. Test with
a non-admin member; a System Administrator never hits this.
If the environment is restricted to a security group, using the same group keeps
environment access and registrar rights in one membership list. Every member
needs their own premium Power Apps entitlement because the registry is in
Dataverse; routing other people's entries through a licensed account is
multiplexing and does not remove that requirement.

`src/outlook-addin` contains an add-in-only manifest template and a static task
pane (published by `.github/workflows/outlook-addin-pages.yml`). The task pane
reads only the open message's sender (`ReadItem`) and links to Sender Registry
with `type` and `target` query parameters. The app validates them, prefills the
Verify form, clears the evidence fields, and never submits; a registrar must
still independently confirm ownership and select Verify. Generate the tenant
manifest privately with
`.\scripts\New-OutlookAddinManifest.ps1 -RegistryOrigin https://<org>.crm.dynamics.com`
(written beneath `.local`), upload it as an Office Add-in in Microsoft 365 admin
center > Integrated apps, and assign only the registrar group. The manifest
includes a mobile form factor; Microsoft notes deployment can take up to 72 hours.
It also sets `SupportsSharedFolders` (desktop/web form factor) so the button
appears in shared mailboxes and delegated folders a registrar has opened; without
it, Outlook hides the add-in there. Mobile apps do not support add-ins in shared
mailboxes. After a manifest change, update the existing Integrated Apps
deployment with the regenerated manifest (same add-in ID, higher version).
The display name shown in the task pane is not identity evidence.

## Official platform references

- [Solution-based ALM](https://learn.microsoft.com/en-us/power-platform/alm/solution-concepts-alm).
- [Connection references and environment-variable deployment settings](https://learn.microsoft.com/en-us/power-platform/alm/conn-ref-env-variables-build-tools).
- [Create table metadata with the Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api).
- [ExportSolution action](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolution).
- [PAC solution commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution).
- [Power Platform pipelines and licensing](https://learn.microsoft.com/en-us/power-platform/alm/pipelines).
