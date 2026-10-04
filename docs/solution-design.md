# Incoming email known-sender qualification

**Status:** Version 0.4.0.0 development architecture with five Dataverse tables
and two disabled manual synthetic proof flows. One delivered external message
has displayed `MTC Proof - not known` in Outlook web. No automatic processor,
onboarding app, shared-mailbox deployment, or production activation is complete.
See the [replication pattern](replication-pattern.md) for exact evidence.

## 1. Product purpose

Answer one bounded question for a delivered email:

> Does the visible sender match an active independently approved address or
> business domain, with trusted receiving-system authentication?

The visible answer is binary:

| Presentation | Meaning |
| --- | --- |
| `Known sender` | Active exact contact or approved business-domain match, plus trusted receiving authentication aligned to the visible From domain |
| `Not known` | No active match, missing/failed/ambiguous authentication, expired/revoked evidence, conflicting sender identity, unsupported evidence, or processing failure |

`Known sender` is business context, not a safety verdict. It does not replace
Exchange Online, Defender for Office 365, spam/phishing filtering, Safe Links,
Safe Attachments, endpoint protection, or user judgment.

New legitimate contacts remain delivered under native Microsoft policy and
begin as `Not known`. An authorized registrar can approve an exact address or
business domain after independent verification, then enqueue reassessment of
eligible retained messages.

## 2. Non-negotiable safeguards

- Never create broad sender allowlists, spam bypasses, quarantine releases, or
  impersonation exceptions from the MTC registry.
- Never learn trust automatically from incoming email, prior conversations,
  display names, logos, signatures, or contact cards.
- Consumer-mail providers such as Gmail cannot be approved wholesale for one
  customer. Approve an exact independently verified address instead.
- A domain match must be exact. Subdomains require explicit approval.
- A known sender is not a verified human and does not prove that an account is
  uncompromised or that message content is harmless.
- Missing, duplicate, malformed, expired, or conflicting evidence fails closed
  to `Not known`.
- No label means unassessed or failed processing, not Known.

## 3. Architecture

```text
Sender onboarding
  -> Independent evidence
  -> Authorized registrar approval
  -> Dataverse known-sender registry

Delivered email
  -> Exchange Online / native Microsoft protections
  -> Scoped MTC processor
  -> Retrieve immutable message metadata and receiving authentication
  -> Exact address/domain registry lookup
  -> Persist assessment metadata
  -> Replace only MTC-owned Outlook category

Registry approval, expiry, or revocation
  -> Reassessment queue
  -> Reconcile retained-message presentation
```

| Component | Responsibility |
| --- | --- |
| Exchange Online / Defender | Native email security, quarantine, impersonation protection, link/attachment controls, and remediation |
| Dataverse | Approved parties, exact contacts/domains, verification lifecycle, and assessment metadata |
| Power Apps | Simple registrar onboarding, approval, expiry, and revocation experience |
| Power Automate | Candidate orchestration for a bounded pilot |
| Microsoft Graph | Immutable message reads and category writes when connector capabilities are sufficient |

The processor operates after delivery. A user can open a message before a
category appears; this is not a pre-delivery gateway.

## 4. Dataverse records

Version 0.4.0.0 contains five custom user-owned tables:

| Record | Purpose |
| --- | --- |
| BusinessParty | Independently reviewed organization or relationship |
| ApprovedDomain | Exact approved business domain; no implicit subdomains or consumer-provider approval |
| ApprovedContact | Exact approved email address and optional exact Reply-To addresses |
| VerificationCase | Request, evidence reference, expiry, actual registrar/reviewer, approval/rejection/revocation, and audit history |
| MessageAssessment | Mailbox reference, immutable message ID, timestamps, registry/rule versions, relationship/authentication state, reason codes, processing status, and presentation outcome |

Do not store message bodies, attachments, credentials, or customer evidence in
`MessageAssessment`. Evidence references point to separately approved restricted
storage.

Required server-side verification behavior:

1. Trust the authenticated caller context, never actor identifiers supplied in
   a command body.
2. Enforce the selected single-registrar or independent-review mode.
3. Require independent evidence and a future expiry.
4. Reject unauthorized approval, self-approval in independent-review mode,
   expired evidence, forged verifier identity, and invalid state transitions.
5. Revoke or expire records immediately for future Known decisions and enqueue
   presentation reconciliation.

## 5. Known decision rule

An email is `Known sender` only when all applicable conditions pass:

1. The message is inside an explicitly approved mailbox scope.
2. The processor selects exactly one individual message using an immutable
   Graph ID, not conversation ID, subject, or Internet Message ID.
3. Exactly one trusted Microsoft receiving `Authentication-Results` boundary is
   identified; duplicate or attacker-supplied ambiguity fails closed.
4. DMARC passes and aligns exactly to the visible From domain under the approved
   initial policy.
5. The visible From address matches one active approved exact contact, or its
   domain matches one active explicitly approved business domain.
6. The matched record and party are approved, independently evidenced, not
   expired or revoked, and unambiguous.
7. Sender/Reply-To evidence required by the configured rule is supported and
   non-conflicting.

Everything else is `Not known`.

The current live proof recognizes the observed Microsoft auth-service marker
`mx.microsoft.com` and requires SPF, DKIM, DMARC, and composite authentication
pass. This is bounded development evidence, not yet a generalized production
parser.

## 6. Outlook presentation

The service owns exactly two categories:

- `MTC Proof - known sender`
- `MTC Proof - not known`

Production names can drop `Proof` only after acceptance and activation approval.
Category reconciliation must:

- Preserve every unrelated user category.
- Remove all prior MTC-owned categories before adding the current binary state.
- Verify the category after PATCH.
- Use `If-Match` with the message ETag.
- Record assessment success separately from presentation success.

Outlook categories are user-editable presentation hints, not security controls.
Verify text/color behavior in supported desktop, web, mobile, tablet, and shared
mailbox clients. A future Outlook add-in can provide richer presentation, but it
is not required for the first pilot.

## 7. Processing lifecycle and failures

Use a durable record keyed by tenant, mailbox, and immutable message ID. Handle
duplicate triggers, moves, retries, throttling, and service-generated category
updates without creating duplicate assessments or loops.

Failures must remain visible:

- Message/header/registry cardinality mismatch -> `Not known`, failed run, alert.
- Category write/readback failure -> assessment records presentation failure.
- Missing assessment -> not Known.
- Connector or subscription outage -> reconciliation queue and service-health
  alert; never an optimistic default.

The two manual proof flows currently export Off. Automatic arrival triggers,
shared-mailbox behavior, excluded-mailbox denial, generalized authentication
parsing, alerting, and reconciliation remain production blockers.

## 8. Access, privacy, and licensing

Limit processor access to approved pilot mailboxes and prove access denial for
excluded mailboxes. Do not grant Mail.Send when the processor only reads and
categorizes messages.

Use solution connection references and environment-variable definitions rather
than tenant constants. Keep OAuth connections, mailbox scope, registrar
assignments, environment current values, customer records, evidence, and run
output tenant-local.

Dataverse and premium Power Platform capabilities require appropriate user and
flow-owner licensing. Confirm actual assignments and enabled service plans.

## 9. Platform references

1. [Anti-phishing policies in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about)
2. [Email authentication in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about)
3. [Microsoft Graph message resource](https://learn.microsoft.com/en-us/graph/api/resources/message)
4. [Update message](https://learn.microsoft.com/en-us/graph/api/message-update)
5. [Solution-based ALM](https://learn.microsoft.com/en-us/power-platform/alm/solution-concepts-alm)
6. [Connection references](https://learn.microsoft.com/en-us/power-platform/alm/conn-ref-env-variables-build-tools)
