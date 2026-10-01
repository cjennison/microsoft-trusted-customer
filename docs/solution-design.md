# Incoming email qualification: solution design

**Status:** Proposed product architecture with an implemented development
registry/schema foundation. No operational email qualification, onboarding app,
or production deployment has been validated. See the
[replication pattern](replication-pattern.md) for the exact implementation status.
**Design date:** September 30, 2026.

## 1. Product purpose and existing solutions

Help a contractor answer: "Does this email match the business relationship we
verified, and what should I independently check before acting?"

Microsoft already covers much of the technical foundation. All Microsoft 365
cloud mailboxes have baseline anti-phishing capabilities. Defender for Office
365 adds user/domain impersonation protection and other advanced controls.
Business Premium includes Defender for Office 365 Plan 1; confirm the actual
tenant service plans, recipient licensing, and policy scope before promising
features. See [1] and [2].

The custom opportunity is operational: connect approved vendor/client identities,
authorized contacts, expected portals, and independently verified callback
details to the employee's email and payment workflow.

Compare three options during discovery: native Microsoft configuration alone,
Microsoft plus this registry/workflow, and an established email-security product
if the customer needs mature pre-delivery business-email-compromise detection.
Do not build a custom classifier solely to duplicate native protections.

## 2. What "qualified" means

Keep these separate rather than assigning one universal trust score:

| Dimension | Evidence | What it does not prove |
| --- | --- | --- |
| Business relationship | Independently approved organization, domain, and exact contact record | That the current email came from that contact |
| Message authentication | Receiving-system results for SPF, DKIM, DMARC alignment, and Microsoft's composite authentication | That a particular human signed in, or that their account is uncompromised |
| Message risk | Defender assessment, unexpected Reply-To, lookalike domains, unfamiliar payment links, and requested payment changes | That the absence of a detected signal makes the content safe |
| Transaction authorization | Separate invoice/payment approval and verified callback or authenticated business workflow | That future requests from the same sender are authorized |

DMARC evaluates alignment with the visible From domain using SPF or DKIM; it
does not authenticate an individual person. `compauth=pass` is also not a
safe-email verdict. A real attacker-owned lookalike domain can pass SPF, DKIM,
and DMARC. See [2] and [3].

Entra guest onboarding or a Power Pages sign-in can establish a portal identity,
but does not cryptographically bind ordinary future SMTP messages to that
session. If stronger individual assurance is required, evaluate signed email
such as S/MIME or move sensitive requests into an authenticated portal. Neither
removes the need for transaction approval.

### Non-negotiable safeguards

- Never set spam confidence to bypass filtering, add Safe Senders, release
  quarantine, or exempt impersonation checks because a registry record matches.
- In Defender, **domains to protect** and **trusted senders and domains** have
  different purposes. The latter creates impersonation exceptions; do not
  populate it from the business registry. See [2].
- Never promote an organization, domain, contact, or payment portal solely
  because it appeared in email, matched a display name, or communicated before.
- A logo, conversation thread, caller ID, contact card, or HTTPS padlock is not
  independent identity verification.
- Never label messages "safe," "payment approved," or "verified human" based on
  a sender match. A recognized contact can still send a malicious message.
- Require independent verification for bank-detail changes and payment
  redirection at any amount. Agree additional payment approval thresholds with
  the customer; do not invent a universal dollar threshold.

## 3. Recommended architecture

```text
Supplier/client onboarding
  -> Independent identity and callback verification
  -> Human approval in Power Apps
  -> Dataverse approved-party registry
       ^ Optional integration with an existing Dynamics 365 party record
       |
Internet email
  -> Exchange Online / Microsoft email protections
       -> Native block/quarantine where configured
       -> Delivered messages in scoped pilot mailboxes
            -> Power Automate trigger OR Graph notification + worker
            -> Retrieve original message metadata and trusted auth evidence
            -> Deterministic registry/risk assessment
            -> Record assessment, reasons, and processing status
            -> Outlook category + restricted review workflow

Payment or banking-change request
  -> Separate AP approval and verified callback / authenticated portal
  -> Never approved by the email qualification service
```

### Microsoft component responsibilities

| Component | Responsibility |
| --- | --- |
| Exchange Online / Defender for Office 365 | Primary email security, impersonation policies, native warnings, link/attachment protection, and quarantine |
| Dataverse | Approved business identities, verification lifecycle, and assessment/review records |
| Power Apps | Onboarding, independent approval, revocation, and reviewer workspace |
| Power Automate | Candidate low-code orchestration for a bounded pilot; verify trigger, header retrieval, category, and shared-mailbox support |
| Microsoft Graph + Azure worker | Alternative when connector limitations prevent reliable retrieval or processing; supports message reads, notifications, and category updates |
| Dynamics 365 | Optional source of existing organization/contact records; importing a record does not make it verified |
| Copilot Studio | Optional explanations and reviewer assistance over authorized records; cannot grant trust or authorize payments |

Start with the smallest supported implementation. Do not require Dynamics 365,
Copilot Studio, or an Azure worker if the customer does not need them.

### Delivery timing and Outlook limitations

Power Automate mailbox triggers and Graph message notifications operate
**after delivery**. A user may read or act on a message before classification.
This pilot is not a pre-delivery gateway and cannot promise protection before
the first open or click.

Graph can update categories on received messages. Its message-update API does
not allow rewriting a received message's body or subject; those properties are
updatable only for drafts. Do not design a flow that patches a green banner into
the body of a received message, or forwards/re-sends it to simulate that. See [4].

Exchange mail flow rules can prepend disclaimers during transport, but their
documented conditions do not provide a live Dataverse lookup action. Using
registry-driven transport rules would require a separate synchronization and
deployment design, with rule limits, precedence, authentication handling, and
rollback validated. It is not the proposed first pilot. See [5] and [6].

If incoming disclaimers are later evaluated, account for encrypted/signed
messages and fallback behavior. Microsoft warns against the `Wrap` fallback for
external incoming messages because it interferes with Safe Attachments scanning.
Body banners can also be copied by an attacker or survive in quoted replies;
they must not serve as authoritative trust evidence. See [6].

Outlook categories are user-editable presentation hints, not security controls.
Verify their visibility and usability in the customer's desktop, web, mobile,
tablet, and shared-mailbox clients. Use explicit text rather than color alone.
An Outlook add-in could later show live assessment details, but is not a
first-day dependency.

## 4. Proposed Dataverse records and onboarding

These are the target logical record types. The development foundation deploys
basic columns and relationships for all seven, but approval enforcement,
role/authority controls, restricted callback details, and the operational
workflows remain unimplemented. Schema fields alone do not establish trust.
A licensing-constrained
discovery prototype could use restricted SharePoint lists, but that is not an
assumption of equivalent governance or a production commitment.

| Record | Minimum proposed fields |
| --- | --- |
| BusinessParty | ID, organization name, relationship type, owner, status, verification method, verified/expiry timestamps, approver, restricted evidence reference |
| ApprovedDomain | Party ID, exact normalized domain, purpose, explicitly approved subdomains, status, verification timestamps |
| ApprovedContact | Party ID, exact email address, role, authority for payment-related communication, approved Reply-To addresses, status, verification timestamps |
| ApprovedPortal | Party ID, exact hostname, purpose, third-party provider relationship, status, verification timestamps |
| VerificationCase | Party/contact reference, pending/approved/rejected/revoked state, requester, independent reviewer, evidence reference, change history |
| MessageAssessment | Tenant/mailbox reference, stable message identifier, received/assessed timestamps, registry/rule versions, relationship/authentication states, risk reasons, completeness, processing status, presentation outcome |
| PaymentVerification | Request/invoice reference, reviewer, callback/portal verification outcome, independent approver, timestamps; reference the financial system rather than copying bank details |

Store verified callback details in a restricted business record. Readers of an
email label do not need permission to change identities or callback numbers.

Onboarding:

1. Obtain organization/contact details through an existing contractual record,
   established relationship, or independently sourced business contact.
2. Verify organization affiliation, exact contact addresses, expected reply
   addresses, and payment portal hosts. DNS proof can demonstrate domain
   control, but does not alone establish the legal/business relationship.
3. Verify callback details independently, not using the phone number or link
   from the suspicious message. Separate the requester and approver.
4. Approve with a documented scope, verification date, and review/expiry date.
5. Reverify material changes, revoke on suspected compromise or relationship
   termination, and stop using expired/revoked records immediately for new
   qualification. Invalidate cached results and identify affected assessments.

Consumer/shared mail domains such as Gmail must never be approved wholesale
for one vendor. Use exact independently verified addresses, and explain that
domain-level authentication still does not prove control of that individual
mailbox. Third-party invoice services require explicit scoped onboarding.

## 5. Assessment policy

Use deterministic checks and understandable reason codes, not an LLM verdict.
Persist relationship, authentication, and risk separately. A review-required
result always takes precedence over a positive relationship label.

| Presentation state | Conditions and meaning |
| --- | --- |
| Review required | Suspicious or conflicting evidence: impersonation signal, failed authentication, unexpected reply destination, suspicious payment URL, or payment redirection. Can apply even to a recognized contact. |
| Qualification incomplete | Required evidence is missing, unreadable, unsupported, or processing failed. No positive qualification; expose the limitation and retry/review status. |
| Recognized contact - payment not verified | Active exact approved contact, supported authentication evidence, and no unresolved review signal in completed checks. Describes sender qualification only. |
| Recognized domain - contact unverified | Active exact approved business domain and supported authentication evidence, but no approved exact contact. Never grants payment authority. |
| Unrecognized sender | No approved relationship match. Not automatically phishing; provide a controlled onboarding/review path. |

Authentication failures can be caused by legitimate forwarding or intermediary
services. Review them rather than treating every failure as proven fraud.
For the initial positive qualification path, require receiving-system DMARC
pass aligned to the visible From domain. Forwarding/ARC or other exceptions
need a separately tested, scoped policy; do not substitute a bare
`compauth=pass` check. See [3].

Implementation requirements:

- Parse the visible From address, Sender, Reply-To, and authentication results
  separately. Do not classify solely from the display name or envelope sender.
- Use a proper address/domain parser and IDNA normalization. Preserve raw
  values for review; do not strip meaningful characters, collapse dots, or
  assume case normalization rules for email local parts.
- Match approved domains exactly, with explicitly approved subdomains. Never
  use substring matches: `vendor.example.attacker.invalid` is not
  `vendor.example`. Similarity can raise a review signal, never grant trust.
- Establish the trusted receiving-system authentication-header boundary in
  the actual mail topology. Arbitrary or duplicate `Authentication-Results`
  text supplied by a sender must not be accepted as evidence.
- Inspect actual URL target hosts, not just displayed text. Compare relevant
  payment/login targets with approved portal hosts; check lookalikes separately
  from sender-domain lookalikes. Account for Safe Links rewriting and legitimate
  third-party portals without treating every different domain as malicious.
- Do not visit suspicious links or resolve arbitrary redirect chains from an
  unrestricted backend. Use native protection or a controlled analysis design;
  shortened/unsupported links are unresolved evidence, not trusted links.
- Treat encrypted content, unsupported attachments, QR codes, and unavailable
  URLs as inspection limitations. The pilot does not replace attachment or
  endpoint security and must not imply it analyzed content it could not read.
- Recognize payment/bank-change language as a review aid, not a complete
  detector. All such changes require independent approval even if automation
  misses them, and a legitimate-mailbox compromise may pass every sender check.

### Assessment lifecycle and failure handling

Use a durable processing record keyed by tenant, mailbox, and a stable message
identifier. Do not use the subject or conversation ID as the deduplication key.
Handle message moves, repeated notifications, retries, throttling, subscription
expiry, and updates caused by the service itself.

Preserve unrelated user categories when updating presentation. Remove/replace
only service-owned labels when reassessing. Assess individual messages, not
entire conversation threads. Record the assessment time so a historical label
cannot imply current authorization after a contact is revoked.

Missing headers, connector skips, worker failures, or unavailable registry data
must produce an incomplete/error state and an operator alert, not a successful
qualification. A failed category update must be recorded separately from a
successful assessment. Include a reconciliation process for missed messages
and visible service-health reporting; no label does not mean "safe."

If later Defender information or a registry revocation contradicts an earlier
assessment, remove the positive presentation and raise review where supported.
Do not disable native post-delivery remediation.

## 6. Access, privacy, licensing, and AI boundaries

Limit access to the customer-approved pilot mailboxes. An app-only Graph
implementation should use scoped Exchange Application RBAC and test both
allowed and excluded mailboxes. Separate unscoped Entra permission grants can
add access beyond RBAC scope; validate effective permissions, not just the role
configuration. Category writes require mail-write authority; category/master
list management may have additional requirements. Do not grant Mail.Send when
the processor only reads and labels messages. See [4], [7], and [8].

Define registry editor, approver, reviewer, and service roles. Enable appropriate
audit history, restrict evidence and flow-run output, agree retention, and use
customer-approved environments and Power Platform data policies. Keep secrets
out of Git; use approved credential storage and non-personal operational
ownership for automation.

Dataverse is a premium connector for Power Apps and Power Automate. Confirm
license entitlements, capacity, flow ownership, HTTP/custom connector needs,
Azure costs if applicable, and any Copilot Studio usage before quoting a price.
Do not assume a Microsoft 365 license covers the entire design. See [9] and [10].

If Copilot Studio is introduced, treat email content as untrusted input,
including instructions embedded in messages. Restrict tools and data access;
do not allow email-triggered instructions to approve identities, change
callback/bank records, bypass policy, or execute payments. AI output can explain
or suggest review, but deterministic policy and authorized humans control
qualification and approval.

## 7. Incident interpretation and scope limits

The client report supports investigating lookalike hyperlinks and vendor
impersonation; it does not establish the original sender's authentication
results or confirm account compromise.

The supplied screenshot appears to show a report/forwarding wrapper with an
attached Outlook message. Wrapper headers and "Questionable URLs: None" do not
prove the original payment request was authentic or harmless. Obtain the
original message and appropriate tenant evidence before diagnosing it.

Endpoint antivirus can help with malware but is not a business identity or
payment-verification control. Repeated nuisance calls do not establish that a
phone is being monitored; phone security investigation is outside this pilot.
This system aims to reduce exposure and unsafe action, not to stop attackers
from sending attempts or guarantee detection.

## 8. Microsoft reference material

Public documentation reviewed September 30, 2026. These sources establish
platform capabilities, not successful validation in the customer's tenant.

1. [Defender for Office 365 service description](https://learn.microsoft.com/en-us/office365/servicedescriptions/office-365-advanced-threat-protection-service-description).
2. [Anti-phishing policies and impersonation settings](https://learn.microsoft.com/en-us/defender-office-365/anti-phishing-policies-about).
3. [How email authentication works in Microsoft 365](https://learn.microsoft.com/en-us/defender-office-365/email-authentication-about).
4. [Microsoft Graph: update message](https://learn.microsoft.com/en-us/graph/api/message-update?view=graph-rest-1.0).
5. [Exchange Online mail flow rule conditions and exceptions](https://learn.microsoft.com/en-us/exchange/security-and-compliance/mail-flow-rules/conditions-and-exceptions).
6. [Exchange Online disclaimers and fallback behavior](https://learn.microsoft.com/en-us/exchange/security-and-compliance/mail-flow-rules/disclaimers-signatures-footers-or-headers).
7. [Graph change notifications for Outlook resources](https://learn.microsoft.com/en-us/graph/outlook-change-notifications-overview).
8. [Exchange Online Application RBAC](https://learn.microsoft.com/en-us/exchange/permissions-exo/application-rbac).
9. [Office 365 Outlook connector](https://learn.microsoft.com/en-us/connectors/office365/).
10. [Microsoft Dataverse connector](https://learn.microsoft.com/en-us/connectors/commondataserviceforapps/).
