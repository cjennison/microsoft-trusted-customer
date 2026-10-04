# Client pilot: known sender / not known

**Status:** Pilot approval remains blocked. Version 0.5.0.0 has five Dataverse
tables and two disabled manual proof flows. A synthetic external Inbox message
was shown in Outlook web as `MTC Proof - not known`; repeat processing reused the
same assessment. After a 24-hour exact-address approval with a verified party,
contact, evidence, reviewer binding, and verification case, the same message
changed to `MTC Proof - known sender`; a repeat run reused the same row. No
automatic processor or production label is active. An accelerated expiry test
then reused the same row, removed Known, and restored `MTC Proof - not known`
in Outlook web without deleting the expired records.

Read the [solution design](solution-design.md) before implementation.

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
| Visible sender status | Binary `Known sender` or `Not known` |
| Known rule | Active exact approved address/domain plus trusted receiving authentication |
| New legitimate sender | Delivered and marked Not known; controlled onboarding path |
| Consumer email provider | Exact approved address only; never provider-wide domain approval |
| Presentation | Outlook text category; color is secondary |
| Failure behavior | Missing, conflicting, expired, revoked, unsupported, or failed evidence is Not known |
| Native protection | Remains enabled and authoritative for spam/phishing/malware handling |
| Operating mode | Manual proof, then shadow mode; visible pilot only after acceptance |

## 3. Build the bounded pilot

- [ ] Create synthetic approved parties, exact contacts, and business domains.
- [ ] Implement the registrar workflow with evidence, expiry, revocation, and
  actual-caller audit stamping.
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
