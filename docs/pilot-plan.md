# Client pilot: October 1, 2026

**Status:** Pilot approval remains blocked. A development foundation was built
October 1; see the [replication pattern](replication-pattern.md). A later bounded
own-mailbox synthetic proof dynamically selected one exact immutable message,
preserved an unrelated category, applied and verified one non-positive category,
and persisted one reusable metadata-only incomplete assessment across repeated
runs. A second bounded external-message proof observed one Microsoft receiving
authentication header with SPF/DKIM/DMARC/composite-authentication pass, found
no approved exact contact, applied and verified the neutral unrecognized-sender
category, displayed it in Outlook web, and reused one assessment row. Both
manual flows remain Off. This evidence does not establish a general trusted
header parser, shared/all-mailbox scope, excluded-mailbox denial, automatic
triggering, supported-client acceptance, security, or production gates below.

**First-day goal:** Understand the actual attack, improve the native Microsoft
baseline where authorized, and establish a bounded qualification proof of
concept. Do not promise a production anti-phishing system in one day.

Read the [solution design](solution-design.md) before implementation.

## 1. Discovery and immediate protection

- [ ] Confirm the customer sponsor, Microsoft administrator, accounts-payable
  owner, incident contact, and authorization for the pilot.
- [ ] Confirm actual Exchange Online/Microsoft 365 licenses, Defender service
  plans, mail gateways/connectors, and existing anti-phishing policies.
- [ ] Identify the AP mailbox and a small set of participating users, including
  shared mailboxes and the desktop/mobile/tablet Outlook clients they use.
- [ ] Obtain the original reported message and headers in restricted
  customer-approved storage. Do not rely on the reporting wrapper or open the
  suspect payment link.
- [ ] Determine whether the changed characters were in From, Reply-To, the
  hyperlink target, or several places. Review available message trace,
  Defender detections, and authentication evidence.
- [ ] If money was actually sent or an account was compromised, hand off to the
  customer's bank/incident-response process immediately; the pilot is not the
  incident response.
- [ ] Agree an immediate rule for independently verifying payment redirection
  and bank-detail changes using an established number, never the email's number.
- [ ] Capture existing policies before making authorized changes. Review
  native spoofing/impersonation protection, relevant domains/users to protect,
  safety tips, and Safe Links/Safe Attachments where licensed.
- [ ] Check policy precedence and recipient scope. Do not populate Defender's
  impersonation-exception list or broad allowlists from the registry.

**Output:** Customer-approved scope, incident understanding with uncertainty
recorded, baseline configuration record, and payment-handling instructions.
SharePoint access alone is not Exchange/Defender administration access.

## 2. Decisions to settle with the customer

| Decision | Proposed starting point, subject to confirmation |
| --- | --- |
| Business relationships | A few high-risk subcontractors and their exact AP/payment contacts |
| Mailbox scope | One AP/shared mailbox plus a small representative user group |
| System of record | Existing vendor system if available; otherwise Dataverse with approved onboarding records |
| Budget/licensing | Native baseline first; confirm Dataverse/Power Platform and any Azure entitlements before custom build |
| Onboarding authority | Named authorized registrars using explicitly chosen single-registrar or independent-review mode; independent ownership evidence always required, never automatic trust based on email history |
| Payment controls | Independent verification for any bank change/redirection; customer sets other amount-based approval thresholds |
| Presentation | Explicit Outlook categories plus a reviewer workspace; no "safe" badges |
| Unsupported evidence | Incomplete qualification and review, never an optimistic default |
| Operating owner | Named administrator/reviewer, alert destination, response expectations, retention, and revocation process |
| Pilot timing | Shadow evaluation first; visible labels only after the agreed acceptance gate |

## 3. Build a bounded proof of concept

- [ ] Create restricted approved-party/contact/domain/portal records with
  independent evidence and expiry dates. Use synthetic data for development.
- [ ] Verify one legitimate contact, one legitimate third-party payment portal,
  and callback details through a separate business channel.
- [ ] Spike the complete message path: arrival trigger, original metadata,
  receiving-system authentication evidence, registry lookup, assessment,
  and category write without changing body/subject or user categories.
- [ ] Prove both the shared-mailbox behavior and the actual field-device UX.
  A category visible in Outlook web alone is not sufficient.
- [ ] If the Outlook connector cannot reliably provide the required evidence,
  document the specific limitation and evaluate Graph rather than quietly
  weakening qualification.
- [ ] Start read-only/shadow assessments before enabling category writes.
  Scope permissions to approved mailboxes and prove excluded-mailbox denial.
- [ ] Add explicit processing failures, retry/reconciliation, operational
  alerts, and a way to distinguish missing assessment from unrecognized sender.
- [ ] Keep native filtering/quarantine enabled. Do not auto-release, auto-pay,
  move/delete messages, or deploy registry-generated transport rules.

**Output:** A demonstrated end-to-end prototype or a documented technical
blocker. A prototype is not production approval.

## 4. Acceptance scenarios

Use synthetic mail and approved test identities; do not create real malicious
payment links or send deceptive tests to unapproved recipients. Record expected
and observed results in restricted pilot evidence.

| Scenario | Required result |
| --- | --- |
| Exact approved contact, aligned authentication, ordinary message | Recognized contact, with payment explicitly not verified |
| Approved domain, new individual contact | Domain recognized only; no contact/payment authority |
| One-character lookalike sender domain with valid SPF/DKIM/DMARC | Never recognized; flag the lookalike for review when detected |
| Genuine recognized sender with a one-character lookalike payment URL | Review required; sender recognition cannot suppress the URL concern |
| Spoofed approved From address with failed alignment | No positive qualification; preserve native block/quarantine or require review |
| Unexpected Reply-To on a recognized sender | Review required unless independently approved and in scope |
| Approved vendor using a verified third-party invoice portal | Explain the scoped approved portal relationship, not an arbitrary domain match |
| New legitimate business with no registry record | Unrecognized, not automatically declared malicious; controlled onboarding path |
| New customer approved after their first message arrives | The original retained message is reassessed within the agreed scope and relabeled only if eligible; no resend, move, deletion, or unrelated category loss |
| Exact approved consumer-mail address vs another address on that provider | Only the approved address can match; never recognize the provider domain wholesale |
| Approved name/logo with an unapproved address | No positive match from branding or display name |
| Known-contact payment redirection from an apparently genuine mailbox | Independent payment verification still mandatory, even when authentication passes |
| Forwarded message or legitimate intermediary with broken alignment | Review/incomplete under the initial policy; no blanket whitelist |
| Forged or duplicate authentication headers | Attacker-supplied pass text cannot grant qualification |
| Shortened/rewritten URL, QR-only request, unreadable attachment, encrypted body | Record unsupported/unresolved checks; never claim content was cleared |
| Expired/revoked contact or suspected vendor compromise | No new positive qualification; invalidate cache and reassess affected presentation |
| Duplicate trigger, message move, or service-generated category update | Idempotent assessment; no processing loop or unrelated category loss |
| Connector/registry outage, missed event, or expired subscription | Visible service-health failure; reconciliation; no false positive qualification |
| Category write fails after assessment succeeds | Record presentation failure and alert; do not report successful labeling |
| User opens mail immediately after delivery | Document the unassessed window; no claim of pre-delivery protection |
| External sender copies the proposed badge into its message body | Copied content is not treated as the service's assessment |
| Shared mailbox and real desktop/web/mobile/tablet clients | Agreed labels/review path work for each supported client, or limitations are explicit |
| Access to a mailbox outside pilot scope | Denied by effective permissions, not merely omitted from trigger configuration |
| Nontechnical registrar manages an exact address or business domain | Plain-language workflow, consumer-domain rejection, evidence, expiry/revocation, actual-verifier audit, and server-side enforcement of the selected approval mode |
| Multiple registrars, unauthorized approval, or forged verifier identity | Independently licensed/authorized people can verify; unauthorized callers and verifier impersonation are denied; self-approval is denied in independent-review mode |
| Additional approved employee/shared mailbox and future mailbox enrollment | Same policy and authorized effective access, measured coverage, and explicit enrollment rather than assumed tenant-wide connector access |

## 5. Measure value and gate deployment

Run the same labeled scenario set and representative legitimate messages
against the native baseline and the proposed service. Count assessments and
review outcomes, not "phishing prevented" inferred from a category.

Agree a numeric processing-latency target, false-positive/reviewer-workload
budget, pilot duration, and legitimate-mail sample size after measuring the
tenant. These thresholds are open decisions, not established service guarantees.

Record:

- Assessment coverage, failures/missed messages, and delivery-to-label latency,
  including the proportion read before qualification.
- Review-required precision and known impersonation/lookalike scenarios missed,
  with evidence limitations recorded.
- Legitimate messages unnecessarily escalated and reviewer time.
- Payment-change requests independently verified and exceptions attempted.
- Whether staff can explain the difference between "recognized" and "safe"
  and complete the callback workflow on their actual devices.

**Gate for visible pilot labels:** Every agreed deterministic acceptance
scenario passes, no negative scenario receives positive qualification, mailbox
scope and supported clients are proven, failure alerting works, and the AP
owner accepts the remaining delivery race and review workload.

**Gate for production expansion:** Customer-approved operating procedures,
licensing/costs, monitoring, retention, onboarding/revocation ownership, rollback,
and demonstrated benefit over the native baseline. No automatic payment
authorization at either gate.

## 6. Rollback and follow-on work

Disable the qualification flow/worker and subscriptions, remove only
service-owned categories if required, and revoke its access when retiring the
pilot. Preserve evidence according to the retention agreement and leave native
email protections in place. Restore any native policy changes from the
approved baseline only with administrator authorization.

After the pilot, consider a richer Outlook add-in, existing Dynamics 365
integration, authenticated payment-change portal, or Copilot Studio reviewer
assistant only if the evidence supports the added complexity.
