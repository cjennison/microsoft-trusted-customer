# Reusable deployment pattern

**Implemented foundation:** version 0.1.0.0 was created and published in an
authorized development sandbox on October 1, 2026. The repository contains
the deterministic schema bootstrap, reviewed managed/unmanaged solution source,
export/build scripts, tests, CI, configuration examples, and an agent skill.

**Not implemented:** the onboarding/review app, independent approval enforcement,
custom security roles, mailbox connectors, classifier, labels, reconciliation,
monitoring, or production deployment. No email is being qualified by this release.

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
| Apps/automation (not built yet) | Solution-aware apps/flows, connection reference and variable definitions | OAuth connections, operational owner, role assignments, mailbox scope, alert destination |
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

## Bootstrap development

Prerequisites: Node.js 22+, PowerShell 7, .NET 10 SDK for the pinned PAC tool,
and an installed Vercel `agent-browser` with its local browser available.
Bootstrap supports commercial-cloud Sandbox/Developer environments only.
Developer/trial access does not establish production licensing.

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
verified HTTPS origin, organization ID, environment type, session, tab, and
explicit authorization. Organization ID is not the Power Platform environment
ID or Entra tenant ID; verify each independently.

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
ApprovedPortal, VerificationCase, MessageAssessment, and PaymentVerification,
with parent/contact/reviewer lookups. All custom tables are user-owned.
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

There is no processor to enable yet. These definitions are the future configuration
contract, not proof of a functioning runtime or a sufficient kill switch by themselves.
Keep current values out of this publicly exported development solution.

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

The build validates solution identity, seven table roots, reference-only User
dependency, safe defaults, absence of current values/unreviewed connections,
and XML parsing. It packs managed and unmanaged ZIPs and verifies their actual
manifest managed flags and version. Outputs/hashes are generated under ignored
`artifacts`. Choose a fresh output directory for each repeat build.

The foundation source validator intentionally describes this release's scope.
When adding apps/flows/connection definitions or changing defaults, review and
update its contract and tests as part of the feature; don't bypass it.
CI produces the two ZIPs as build artifacts, not approved production releases.

## Another customer's deployment

Use `config\client.example.json` in private approved storage to record discovery
and gate evidence. Default all gates to unknown/not started. For a product
deployment, create test/pilot resources with authorization, then import the same
managed release instead of rerunning the development bootstrap on production.

The foundation can be imported into an approved test environment, but doing so
does not deploy the unimplemented application or prove cross-tenant operation.
No second-tenant import or email acceptance testing is claimed for this release.

For a reviewed release, the supported PAC commands are:

```powershell
# PAC authentication is separate from the browser's sign-in.
# Verify and use a customer-specific profile; never change another session's profile.
dotnet tool run pac auth create --name CUSTOMER_TEST `
  --tenant VERIFIED_TENANT_GUID --environment https://example.crm.dynamics.com --deviceCode

dotnet tool run pac solution create-settings `
  --solution-zip .\artifacts\build\MicrosoftTrustedCustomer_0.1.0.0_managed.zip `
  --settings-file .\.local\deployment.local.json

# Populate target-local settings and independently confirm target/scope first.
dotnet tool run pac solution import `
  --environment https://example.crm.dynamics.com `
  --path .\artifacts\build\MicrosoftTrustedCustomer_0.1.0.0_managed.zip `
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

## Official platform references

- [Solution-based ALM](https://learn.microsoft.com/en-us/power-platform/alm/solution-concepts-alm).
- [Connection references and environment-variable deployment settings](https://learn.microsoft.com/en-us/power-platform/alm/conn-ref-env-variables-build-tools).
- [Create table metadata with the Web API](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/create-update-entity-definitions-using-web-api).
- [ExportSolution action](https://learn.microsoft.com/en-us/power-apps/developer/data-platform/webapi/reference/exportsolution).
- [PAC solution commands](https://learn.microsoft.com/en-us/power-platform/developer/cli/reference/solution).
- [Power Platform pipelines and licensing](https://learn.microsoft.com/en-us/power-platform/alm/pipelines).
