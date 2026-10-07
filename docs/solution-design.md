# Incoming email known-sender qualification

**Status:** Version 0.9.1.0 development architecture with six Dataverse tables,
two disabled manual synthetic proof flows, a portable certificate-authenticated
Graph connector, and separate shadow/presentation workers exported Off.
One delivered external message
changed from `MTC Proof - not known` to `MTC Proof - known sender` after an
approved 24-hour exact-contact record was added. An accelerated expiry test
then reconciled the same retained message back to Not known. An app-only
Exchange-RBAC proof also categorized one immutable message in each shared
mailbox, proved HTTP 403 for a temporarily excluded mailbox, and then validated
HTTP 200 across all 12 current mailboxes under the permanent mailbox-type scope.
The shadow processor performs no category writes. Production activation
is not complete. The Sender Registry app, caller-stamped
single-registrar APIs, protected registry writes, identity keys, and separate
registrar/operator roles are now deployed and demonstrated with synthetic data.
The authorized development pilot now runs metadata-only shadow assessment across
enrolled user/shared mailboxes with complete Graph pagination, leased overlap
checkpoints, deterministic case-sensitive message identities, 30-day registry
reassessment, and user-specific in-app alerts. Outlook presentation is a separate
Off worker with an independent Disabled/Pilot/Production setting. An authorized
single retained proof message passed Known and revocation-to-Not-known server
planning, ETag writes, exact readback, and actual Outlook web visibility.
The enabled Power Automate worker also passed the same transition on one
explicitly scoped assessment using the real certificate connector, then was
restored Off with labeling Disabled and the contact Revoked.
Tenant-wide presentation execution and production activation remain unaccepted.
See the [replication pattern](replication-pattern.md) for exact evidence.

## 1. Product purpose

Answer one bounded question for a delivered email:

> Does the visible sender match an active independently approved address or
> business domain, with trusted receiving-system authentication?

The visible answer is binary:

| Presentation | Meaning |
| --- | --- |
| `✓ Known sender` | Active exact contact or approved business-domain match, plus trusted receiving authentication aligned to the visible From domain |
| `Unknown sender` | No active match, missing/failed/ambiguous authentication, expired/revoked evidence, conflicting sender identity, unsupported evidence, or processing failure |

The stored non-positive Dataverse decision remains `Not known`; `Unknown sender`
is the improved Outlook presentation, not a policy or schema change.

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

Version 0.9.1.0 contains six custom user-owned tables:

| Record | Purpose |
| --- | --- |
| BusinessParty | Independently reviewed organization or relationship |
| ApprovedDomain | Exact approved business domain; no implicit subdomains or consumer-provider approval |
| ApprovedContact | Exact approved email address and optional exact Reply-To addresses |
| VerificationCase | Request, evidence reference, expiry, actual registrar/reviewer, approval/rejection/revocation, and audit history |
| MessageAssessment | Mailbox reference, immutable message ID, timestamps, registry/rule versions, relationship/authentication state, reason codes, processing status, and presentation outcome |
| MailboxEnrollment | Tenant-local mailbox type, paused/enrolled state, polling checkpoint, last attempt/success, health, and operator-visible error |

Do not store message bodies, attachments, credentials, or customer evidence in
`MessageAssessment`. Evidence references point to separately approved restricted
storage.

The registrar MVP implements `mtc_VerifySender`, `mtc_RevokeSender`, and
`mtc_SetMailboxEnrollment` as caller-context Dataverse custom APIs. Verification
and revocation require `MTC Registrar` membership; mailbox enrollment requires
`MTC Operator` membership. The service rejects disabled/application users for
these interactive operations and impersonated callers. Direct registry
Create/Update/Delete and approval relationship changes are rejected by
synchronous plug-ins, rather than relying on form controls. New immutable
verification cases retain the exact target, method, evidence reference, expiry,
revocation reason, actual user, and server time.

This live MVP supports only the explicitly selected single-registrar model.
Independent-review behavior remains an offline contract. The shadow processor
uses immutable approval/revocation events and due expiry to rescan the approved
retained-message window. Completed shadow reassessment does not establish
completed Outlook presentation. The automatic category path passed a scoped
one-message proof, not wider mailbox/client or production acceptance.
Organization-wide Dataverse auditing remains a separately
authorized configuration step; immutable cases are not a claim that it is enabled.

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

**Subdomain wildcards (0.9.5.0):** a domain entry written `*.example.com`
approves `example.com` and every subdomain. The most specific existing entry
decides (exact domain, then the nearest wildcard), so revoking a narrower entry
is never overridden by a broader one. Wildcards are rejected for consumer
providers, shared multi-tenant platforms (for example `onmicrosoft.com`,
`sharepointonline.com`, `amazonses.com`), and public suffixes such as `co.uk`.

**Internal mail (0.9.4.0):** mail sent by a signed-in user of the same
organization never crosses the inbound boundary, so it has no inbound DMARC
result. It qualifies through condition 3/4's alternative only when Exchange's own
stamps show exactly one `X-MS-Exchange-Organization-MessageDirectionality:
Originating`, `X-MS-Exchange-Organization-AuthAs: Internal`,
`X-MS-Exchange-CrossTenant-AuthAs: Internal`, and a Microsoft-hosted
`AuthSource`. Exchange strips externally supplied organization headers, and
duplicates fail closed. Sender/Reply-To and registry rules still apply, so the
organization's own domain is added like any other sender. A compromised internal
account would still show Known.

The live parser (0.9.8.0) accepts exactly one Microsoft receiving
`Authentication-Results` header, with the `mx.microsoft.com` authserv-id or with
none (Microsoft omits it on some delivery paths; any other authserv-id is
rejected). It requires `dmarc=pass`, or `dmarc=bestguesspass` for a sender with
no published DMARC policy, plus `compauth=pass` and exact `header.from`
alignment with the visible From domain. DMARC pass already means SPF or DKIM
aligned, so SPF and DKIM are not separately required. Spoofed mail still fails
DMARC and compauth.

## 6. Outlook presentation

Both authorized presentation modes use the same current names:

| Category | Recommended color |
| --- | --- |
| `✓ Known sender` | Blue (Outlook web: Sky blue) |
| `Unknown sender` | Gray (Outlook web: Silver) |

The four legacy `MTC Proof - known sender`, `MTC Proof - not known`,
`MTC - known sender`, and `MTC - not known` names remain exact owned migration
aliases. Reconciliation removes these and any prior current service label before
applying one current category. Neither Pilot nor Production is a mailbox
allowlist; production still requires separate acceptance and activation approval.
Category reconciliation must:

- Preserve every unrelated user category.
- Remove all prior MTC-owned categories before adding the current binary state.
- Verify the category after PATCH.
- Use `If-Match` with the message ETag.
- Record assessment success separately from presentation success.

Outlook categories are user-editable presentation hints, not security controls.
The checkmark is plain category text, not Outlook's native verification badge.
Colors belong to each mailbox's master category list, not the solution or
message PATCH. Set up the exact names/colors under authorized mailbox access
before visible activation, checking for existing-name collisions. Native Outlook
setup does not require granting the processor additional permissions. Automated
master-category creation would require separately authorized
`MailboxSettings.ReadWrite`; current mail-processing access does not grant it.
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

All four portable flows export Off. The development shadow worker is separately
authorized and running: it persists every complete page and only advances the
delivery checkpoint after the final page. A page failure stops the loop, retains
the cursor, records failed health, and alerts the configured operator. Registry
approval/revocation and due expiry trigger the bounded retained-message rescan.
The label worker requires independent authorization and rechecks current
registry/authentication eligibility before planning and after readback. Its
tenant-wide category path has not been accepted or activated.

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
