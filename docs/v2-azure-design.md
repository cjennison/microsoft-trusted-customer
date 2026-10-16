# Version 2: Azure-only design (no Dataverse, no Power Platform)

**Status:** Proposed, 2026-10-16. Not built. Version 1 (0.9.13.0) stays the
production release until v2 passes the parallel run in section 8.

## 1. Why

Version 1 keeps the registry in Dataverse, so every registrar needs premium Power
Apps rights: a Power Apps Premium seat ($24 per month on monthly terms) or the
pay-as-you-go meter ($10 per active user per month). An Azure front end that
reads or writes Dataverse for unlicensed users is multiplexing and doesn't
remove that requirement (see the
[licensing section](email-verification-workflow.md#licensing-and-all-mailbox-operation)).
The processor flows also need a Power Automate Premium owner ($15 per month), and
the environment uses Dataverse capacity.

Version 2 keeps the same decision rule, safeguards, labels and Outlook button, but
stores the registry in the customer's own Azure subscription. With no Dataverse
data, no Power Platform licenses are needed. Expected running cost is **under $2
per month per customer**, whatever the number of registrars.

| | v1 (SES, October 2026) | v2 |
| --- | --- | --- |
| Registrar access | $10 per active registrar per month (pay-as-you-go) or $24 per seat | $0: Microsoft 365 sign-in, limited to the registrar group |
| Processor | Power Automate flows + Dataverse plug-ins; owner needs Power Automate Premium | Azure Functions (timer), managed identity |
| Registry and assessments | Dataverse tables | Azure Table Storage, plus an append-only audit log in immutable Blob Storage |
| Graph identity | "MTC Mailbox Processor" app, certificate in the custom connector | Same app; the Function's managed identity is a federated credential on it, so there's no certificate or secret to rotate |
| Outlook | Categories `✓` / `Unknown sender`; "Verify sender" add-in opens the model-driven app | Unchanged categories; the add-in opens the v2 registrar page |
| Typical monthly cost | $15 + $0–40 + Dataverse capacity | Under $2 |

## 2. What stays the same

- The [Known decision rule](solution-design.md#5-known-decision-rule), including
  Reply-To, wildcard and internal-mail rules, and every
  [non-negotiable safeguard](solution-design.md#2-non-negotiable-safeguards).
- Exchange RBAC for Applications: the processor app may read and categorize mail
  only in the scoped mailboxes; no `Mail.Send`; no Entra mail permissions.
- Category reconciliation: preserve unrelated categories, remove owned aliases,
  `If-Match` with the ETag, read back after PATCH, record presentation success
  separately from assessment.
- The single-registrar model, `RequiredRegistrarFields`, immutable verification
  cases stamped with the authenticated caller and server time.
- The Integrated Apps deployment of the "Verify sender" add-in to the registrar
  group (new manifest version, same add-in ID).

## 3. Architecture

```text
Registrar (browser or Outlook "Verify sender")
  -> Function App, built-in authentication (Entra, customer tenant,
     enterprise app "assignment required" = registrar group)
     -> /api/verify, /api/revoke, /api/registry, /api/mailboxes, /api/health
        -> Table Storage (registry, cases, assessments, enrollments)
        -> Blob Storage, immutable container (append-only audit events)
        -> Queue: reassessment requests after approve/revoke/expiry

Timer (every minute) -> Processor function
  -> managed identity -> federated credential -> "MTC Mailbox Processor" app token
  -> Graph: list new messages per enrolled mailbox (delta), read headers
  -> decision (ported C# policy) -> assessment row
  -> Graph: PATCH categories with If-Match, then read back
```

One Function App per customer, deployed into the customer's Azure subscription
from a Bicep template, so each customer owns their data and bill.

## 4. Components

### 4.1 Storage account (Standard LRS)

| Table | PartitionKey / RowKey | Notes |
| --- | --- | --- |
| `Parties` | `party` / party id | Business party |
| `Senders` | `domain` or `address` / normalized identity key | Approved domain (incl. `*.` wildcard) or exact address; status, expiry, party, current case. RowKey uniqueness replaces the Dataverse alternate key |
| `Cases` | identity key / inverted timestamp + id | Immutable verification and revocation cases: method, evidence reference, expiry, reason, caller object id and UPN, server time. Insert-only in code |
| `Enrollments` | `mailbox` / mailbox object id | Enrolled or paused, delta link, lease, last attempt and success, health, last error. **Not audited** (it changes every minute) |
| `Assessments` | mailbox id / immutable message id | Same metadata as `mtc_messageassessment`; no bodies or attachments. Retention 30 days by a daily cleanup timer |
| `Settings` | `settings` / name | Mode (Disabled / Pilot / Production), required registrar fields, window |

- **Audit log:** every registry change also appends one JSON event to a blob in a
  container with a time-based **immutability policy** (365 days, locked after
  acceptance). This replaces Dataverse auditing and is tamper-evident.
- **Queue** `reassess`: approve, revoke and expiry enqueue a bounded rescan of the
  retained window, as v1 does.
- Access: the Function's managed identity gets *Storage Table Data Contributor*,
  *Storage Queue Data Contributor* and *Storage Blob Data Contributor* on this
  account only. Shared-key access disabled.

### 4.2 Function App (Flex Consumption, .NET 8 isolated)

- **Processor** (timer, every minute): lease each enrolled mailbox, page with Graph
  delta so the checkpoint advances only after the final page (v1 semantics),
  assess, persist, then label in Pilot or Production mode. Throttling (429) backs
  off and retries on the next tick; nothing defaults to Known.
- **Reassess** (queue trigger): bounded rescan after registry changes.
- **Registrar API** (HTTP): `verify`, `revoke`, `registry` (list and search),
  `mailboxes` (operator: enroll or pause), `health`. Caller identity comes only
  from the platform-validated principal (`X-MS-CLIENT-PRINCIPAL`, set by built-in
  authentication, which strips any client-supplied copy). Authorization re-checks
  membership of the registrar or operator group through Graph on each write, not
  just at sign-in.
- **Static files**: the registrar page (`src/registrar-app`, fetch layer switched
  from the Dataverse Web API to `/api/*`) and the add-in task pane, served from
  the same origin.
- **Cleanup** (timer, daily): assessment retention and expiry processing.

Flex Consumption's monthly free grant covers a one-minute timer for 12 to 50
mailboxes. The Linux Consumption plan is being retired, so don't use it.

### 4.3 Identity

| Identity | Purpose | Permissions |
| --- | --- | --- |
| User-assigned managed identity `mi-trusted-sender` | Runs the Function App | Storage roles above. Federated credential subject on the processor app |
| "MTC Mailbox Processor" app (existing) | Graph mail access | Unchanged Exchange RBAC `Application Mail.ReadWrite` scoped to enrolled mailbox types. Certificate credential removed after cutover |
| "Trusted Sender Registrar" app (new) | Built-in authentication for the page and API | Sign-in only. Enterprise app **assignment required**, assigned to the registrar group (MTC Registrars) and the operator |
| Function managed identity → Graph | Group membership checks | `GroupMember.Read.All` (application). No user or mail permissions |

### 4.4 Outlook add-in

Same add-in ID, a new version. `SourceLocation` points to the Function App's task
pane. The button opens `/registrar?type=…&target=…` in the browser, as today:
prefilled, never auto-submitted. Re-upload in Integrated Apps (up to 72 hours to
roll out). Categories and colors are unchanged, so users see no difference.

### 4.5 Monitoring

Application Insights (sampling on, daily cap 0.1 GB) plus alert rules into an
action group that emails the operator: processor failures, a mailbox not
succeeding for 15 minutes, and label readback failures. This replaces the
in-app notifications. The weekly review's `Get-TrustedSenderHealth` collector
reads `/api/health` (or the tables) instead of Dataverse.

## 5. Code mapping

| v1 | v2 |
| --- | --- |
| `VerificationPolicy.cs`, `MessagePolicy.cs`, `RegistrarRequirements.cs`, `AssessmentIdentity.cs` | Moved almost unchanged into `TrustedSender.Core` (class library, no Dataverse types) |
| `MailboxRuntime.cs` (lease, begin, page, complete, failure) | `ProcessorFunction` + `TableStore` (same state machine; Dataverse calls replaced by Table operations with ETag concurrency) |
| `LabelRuntime.cs` | `LabelPlanner` in Core + Graph PATCH and read-back in the Function |
| `VerificationApi.cs`, `MailboxApi.cs`, `RegistryWriteGuard.cs` | HTTP functions; the write guard becomes "no write path other than these functions", which storage RBAC enforces |
| Connector custom code and `graph-paging.cs` | `GraphMailClient` (HttpClient, delta paging, `If-Match`) |
| `src/registrar-app` | Same UI; new `api.js` fetch layer |
| `test/*.test.js` (policy contracts) | Kept; plus xUnit tests on Core using the same fixtures |

Estimated effort: 5–7 working days, plus the 7-day parallel run.

## 6. Security notes

- No secrets: the managed identity plus federated credential replaces the
  connector certificate. Storage shared keys are disabled.
- Registry writes are possible only through the authenticated API, which checks
  group membership at write time and stamps the caller from the platform
  principal. Body-supplied actor fields are ignored, as in v1.
- Immutable audit blobs give tamper-evident history; Table rows alone are not the
  audit trail.
- Least privilege on Graph is unchanged: the mailbox scope lives in Exchange, not
  in this app.
- Same privacy rule: assessments hold metadata only.

## 7. Cost (list prices, per customer per month)

| Item | Expected |
| --- | --- |
| Functions Flex Consumption (one-minute timer, small API) | $0 (within the free grant) |
| Storage (tables, queue, about 50 MB of blobs) | $0.05–0.20 |
| Application Insights (capped) | $0–0.50 |
| Licenses | $0 (Microsoft 365 sign-in only) |
| **Total** | **under $2** |

## 8. Migration and acceptance (per customer)

1. Deploy the Bicep template into the customer's subscription. Mode **Disabled**.
2. Copy parties, senders and the full case history from Dataverse (one-off export
   script; cases keep their original caller and time and are marked `migrated`).
3. Run v2 in **Shadow** for 7 days next to v1. A comparison script joins both
   assessment stores on the immutable message id. Accept only with 0 Known/Not
   known disagreements, or each disagreement explained.
4. Cutover (about 15 minutes): v1 label flow Off, v2 mode Production, add-in
   manifest updated, registrars told about the new link.
5. Keep the Dataverse environment read-only for 30 days, then delete it and the
   pay-as-you-go billing plan, and remove Power Automate Premium if nothing
   else needs it.

**Rollback:** v2 mode Disabled, v1 label flow On, previous add-in manifest
re-uploaded. Possible while the Dataverse environment exists.

## 9. Open questions

- Graph change notifications instead of a one-minute poll (lower latency; needs
  subscription renewal every 3 days per mailbox). Not needed for the first
  release.
- Independent-review (two-person) mode: same API, a second endpoint, not in the
  first release.
- Whether to keep a Teams alert for processing failures (Teams incoming webhook
  from the alert action group) to match v1's in-app notices.
