# Client pilot: known sender / not known

**Status:** Visible-label/production approval remains gated. Version 0.9.1.0 has six Dataverse
tables, two disabled manual proof flows, a certificate-authenticated Graph
connector, a running authorized development shadow worker, and a separate Off
presentation worker. A synthetic external Inbox message
was shown in Outlook web as `MTC Proof - not known`; repeat processing reused the
same assessment. After a 24-hour exact-address approval with a verified party,
contact, evidence, reviewer binding, and verification case, the same message
changed to `MTC Proof - known sender`; a repeat run reused the same row. No
production label rollout is active. An accelerated expiry test
then reused the same row, removed Known, and restored `MTC Proof - not known`
in Outlook web without deleting the expired records. App-only Graph access also
proved exact immutable selection, ETag category writes, preservation, readback,
and idempotent assessments on both shared mailboxes; a temporarily excluded
mailbox returned HTTP 403. After propagation, the permanent Exchange mailbox
type scope returned HTTP 200 for all 12 current user/shared mailboxes. The
shadow worker has completed scans across all approved enrolled mailboxes and
performs no category writes. The Sender Registry app and server-side
single-registrar controls are published, with leased paging, bounded registry
reassessment, deterministic ordinal message identities, and in-app failure alerts. Synthetic UI Verify/Renew/Revoke, exact-domain API
verification/revocation, actual-caller stamping, and denied direct/unauthorized,
consumer-domain, expired-evidence, and missing-evidence approvals were observed.

Read the [solution design](solution-design.md) before implementation.

The initial MVP client scope is now explicitly **Outlook web only**.
Desktop, Mac, mobile and tablet clients are deferred rather than implicit
go-live requirements for this initial scope. Shared-mailbox web/category
coverage and the other operational/activation gates still apply.

## 1. Discovery

- [ ] Confirm the customer sponsor, Microsoft administrator, business
  administrator/registrar, incident contact, and authorization boundaries.
- [ ] Confirm actual Exchange Online, Microsoft 365, Power Apps, Power Automate,
  and Dataverse entitlements for every operator and flow owner.
- [ ] Identify approved pilot and excluded mailboxes, including shared
  mailboxes and actual desktop/web/mobile/tablet clients.
- [ ] Review the native Microsoft email-security baseline and policy precedence.
- [ ] Select single-registrar or independent-review verification mode.
- [ ] Name authorized registrars, operational owner, alert destination,
  retention, and rollback owner.
- [ ] Capture baseline evidence in restricted customer-approved storage.

**Output:** approved development/pilot scope, license and access evidence,
operating ownership, and explicit exclusions.

## 2. Product decisions

| Decision | Required starting point |
| --- | --- |
| Visible sender status | Binary `✓` (blue, Known sender) or `Unknown sender` (gray); stored Not known policy remains unchanged |
| Known rule | Active exact approved address/domain plus trusted receiving authentication |
| New legitimate sender | Delivered and marked Not known; controlled onboarding path |
| Consumer email provider | Exact approved address only; never provider-wide domain approval |
| Presentation | Outlook text category; color is secondary |
| Failure behavior | Missing, conflicting, expired, revoked, unsupported, or failed evidence is Not known |
| Native protection | Remains enabled and authoritative for spam/phishing/malware handling |
| Operating mode | Manual proof, then shadow mode; visible pilot only after acceptance |

## 3. Build the bounded pilot

- [ ] Create synthetic approved parties, exact contacts, and business domains.
- [x] Implement and demonstrate the single-registrar workflow with evidence,
  expiry, revocation, actual-caller stamping, and immutable verification cases.
- [x] Publish the guided registrar workspace and operator mailbox controls.
- [x] Stage all existing user/shared mailbox records Paused without activation.
- [x] With separate approval, run all approved mailboxes in metadata-only shadow
  mode with complete paging, overlap checkpoints, current registry decisions,
  30-day reassessment, and observable in-app failure delivery.
- [x] Exercise one separately authorized retained proof email through Known
  and revocation back to Not known, preserving unrelated categories, verifying
  server-side readback, and observing both states in Outlook web.
- [x] Exercise the actual enabled presentation worker on one separately
  authorized retained proof email: real connector category writes, successful
  native runs, server readback, and Outlook web Known then revoked Not known.
  Restore the original definition Off, labeling Disabled, and contact Revoked.
- [x] Exercise the improved labels in the operator's Outlook web mailbox:
  blue checkmark Known, then gray Unknown after revocation, on the same retained
  email through the actual worker. Create colors through native category
  settings without an additional application grant and remove legacy labels.
- [x] On that same scoped proof, reject a real category delta with stale
  `If-Match` (HTTP 412), reject incorrect expected readback, persist failed
  presentation, display an operator alert, and recover on a correct retry.
  Confirm Unknown remains visible and restore the original worker Off/Disabled.
- [ ] Confirm customer app-user entitlements, operational evidence retention,
  client coverage, rollback, and separate production/visible-label authorization.
- [ ] Retrieve immutable message identity and trusted Microsoft receiving
  authentication without message bodies or attachments.
- [ ] Match exact contact first, then explicitly approved business domain.
- [ ] Persist metadata-only assessments and separate processing from
  presentation status.
- [ ] Preserve unrelated Outlook categories and replace only MTC-owned labels.
- [ ] Prove shared-mailbox behavior and excluded-mailbox access denial.
- [ ] For an app-only processor, prove Exchange Application RBAC with app-only
  certificate authentication, no unscoped Entra mail grant, HTTP 200 for
  included mailboxes, and HTTP 403 for an excluded mailbox before broad scope.
- [ ] Add retries, reconciliation, alerts, and service-health visibility.
- [x] Add paused-by-default mailbox enrollment/checkpoint/health records and a
  disabled scheduled metadata-only shadow flow with no category writes.
- [ ] Keep flows Off until each applicable manual scenario passes.

## 4. Acceptance scenarios

Record expected and observed results in restricted pilot evidence.

| Scenario | Required result |
| --- | --- |
| Active approved exact contact with aligned trusted authentication | Known sender |
| Active approved business domain, new individual address | Known sender if domain approval explicitly covers the message domain |
| New legitimate sender with no registry record | Not known; message remains delivered |
| Exact approved consumer-mail address | Known sender |
| Another address at the same consumer provider | Not known |
| Expired or revoked contact/domain | Not known |
| Approved display name/logo but different address | Not known |
| One-character lookalike domain with valid authentication | Not known |
| Approved address with DMARC failure or misalignment | Not known |
| Missing or duplicate trusted authentication boundary | Not known and operator-visible failure |
| Unexpected or unsupported sender/Reply-To identity | Not known |
| Duplicate trigger | Same assessment row and one current MTC category |
| Message move | Immutable identity remains stable or failure is reconciled |
| Existing unrelated Outlook category | Preserved |
| Legacy service category | Replaced with exactly one current label; unrelated categories preserved |
| Checkmark and category color | Exact text plus configured blue/gray color visible in each supported client; no reliance on color alone |
| Existing category with a current service name | Resolve ownership before activation; do not silently recolor or take over a user's category |
| Registrar approves sender after delivery | Same retained message changes from Not known to Known without resend |
| Registrar revokes or evidence expires | Existing eligible presentation reconciles back to Not known |
| Category write/readback failure | Assessment records presentation failure; no success claim |
| Connector/registry outage | Not known/unassessed, alert, retry, and reconciliation |
| Shared mailbox | Same decision and visible category in every supported client |
| Mailbox outside pilot scope | Effective access denied |
| Copied category text in message body | Ignored; only service-owned category metadata counts |

## 5. Measurement and gates

Measure:

- Delivery-to-category latency and messages opened before assessment.
- Assessment coverage, failures, retries, and missed-message reconciliation.
- Known/Not known correctness against the approved registry.
- Registrar workload and time from onboarding to reassessment.
- Visibility and comprehension across supported Outlook clients.

**Visible-pilot gate:** every agreed deterministic scenario passes; no unknown,
expired, revoked, misaligned, or ambiguous sender receives Known; mailbox scope,
failure alerting, client visibility, rollback, licensing, and ownership are
accepted.

**Production-expansion gate:** demonstrated value, operating procedures,
retention, monitoring, costs, onboarding/revocation ownership, and tested
rollback. Known remains business context, never a safe-email verdict.

## 6. Rollback

Disable only the MTC processor/subscriptions, revoke its scoped access if
retiring it, and remove only MTC-owned categories when agreed. Preserve
assessment and verification records under the approved retention policy. Leave
native Microsoft email protections and unrelated tenant resources intact.
