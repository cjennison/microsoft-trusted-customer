# Email verification workflow

**Status:** Product requirements and implementation gates, recorded October 2,
2026. The existing solution is a development schema and offline proof policy;
the app, mailbox runtime, and live positive labels are not implemented.

## The business administrator's workflow

The administrator should not need to understand Dataverse tables, message
headers, or flow configuration. Provide a small workspace with **Needs
verification**, **Verified businesses and contacts**, and **Service health**.

1. Find the unverified sender by address or business name. Show only authorized
   assessment metadata and explain why verification is needed.
2. Select **This email address only** or **This business domain**. Show the exact
   address/domain and the extent of that choice before submitting it.
3. Record the business relationship, an independently verified contact channel,
   verification evidence reference, and a review/expiry date. Incoming email
   alone cannot supply the approval evidence.
4. Select **Verify** after completing the independent checks. In the selected
   single-registrar workflow, an authorized registrar can verify an entry they
   created; no second staff member is required. Enforce registrar authority,
   evidence, expiry, and revocation on the server, not just through a button.
5. After approval, display the registry change and the status of reassessing
   earlier messages. An approval is not proof that relabeling succeeded.
6. Provide **Revoke**, **Correct details**, and **Renew verification** actions,
   with confirmation of their scope and an audit trail.

Support multiple registrars through tenant-local roles/group membership, not a
hardcoded administrator address. Stamp the actual verifying user's identity and
time server-side; a caller cannot claim somebody else's identity. Keep an audit
trail of verification and later edits, and invalidate approval on material
identity changes.

Single-registrar verification removes the second-person check, not independent
business/domain/address ownership evidence. Retain independent-review mode for
customers who require a distinct requester and approver; select the mode
explicitly rather than relaxing controls silently.

App access does not grant access to every mailbox or message body. Separate
registrar authority from mailbox-content access and service permissions. Confirm
each registrar's app entitlement and account recovery where applicable before
granting access. Customer-specific names, membership, and recovery evidence stay
private.

The offline proof supports the explicit single-registrar choice and a registrar
identifier list. A separate offline verification-transition contract now models
trusted-caller authorization, actual-caller stamping, evidence, expiry,
rejection, revocation, and the selected approval mode. These are tested product
rules, not deployed Dataverse roles or enforcement. The app and live
server-side integration remain unbuilt.

## Verification choices

| Choice | Scope | Guardrail |
| --- | --- | --- |
| This email address only | Exact independently approved address, including an address at a shared consumer provider | Another address at the same provider remains unverified; do not collapse dots, plus suffixes, or meaningful local-part characters |
| This business domain | All sender addresses at the exact independently approved business domain | Label the domain relationship, not an independently verified individual; exclude subdomains unless separately approved |
| Shared consumer provider | No whole-domain approval | Reject domain-wide approval of Gmail and other shared providers; guide the administrator to an exact address instead |

Use reserved synthetic examples such as `contact@equipment.example` in public
documentation. Actual addresses, domain approvals, and evidence stay private.

## Outlook presentation and delivery

Use explicit text categories, not color alone. Candidate user-facing wording
is **Verified contact address**, **Verified business domain - contact
unverified**, **Unverified sender**, **Needs review**, and **Unable to verify**.
Finalize wording with actual Outlook-client acceptance; these are not deployed
category names or changes to the existing offline proof labels.

"Verified" describes the independently approved business relationship and
supported sender evidence. It never means a safe message, verified human,
uncompromised account, or approved payment. Review signals override positive
presentation, and missing required evidence cannot produce a positive label.

An unverified new customer's message remains available wherever native
Microsoft protections deliver it. This service does not block, quarantine,
move, delete, forward, resend, or release messages. Native security decisions
remain intact. No category means unassessed, not verified.

Users can edit Outlook categories; categories are presentation hints, not an
authorization mechanism. The app's recorded assessment, registry version, and
processing status are the authoritative service record. Prove category
visibility on the actual desktop, web, mobile, and shared-mailbox clients.

## Approval after delivery and revocation

Approval must enqueue reassessment of existing unverified messages that match
the newly approved identity within an explicitly agreed mailbox/time scope.
Read original message evidence again; do not change every message in a
conversation or promote old messages just because a registry record exists.
Retained messages with valid evidence can be relabeled without redelivery.
Missing, moved, deleted, or inaccessible messages have explicit outcomes.

Revocation, expiry, and material identity changes invalidate cached matches and
enqueue reassessment/removal of affected service-owned positive categories.
Remove or replace only exact service-owned categories; preserve unrelated user
categories and record presentation failures separately from assessment results.
Expose queue progress, retries, failures, and last successful processing in
Service health. Durable idempotency and reconciliation must cover arrival and
registry-change processing.

## Licensing and all-mailbox operation

The eventual scope is incoming delivered mail across all explicitly approved
customer mailboxes, not just the maker's mailbox. Start with authorized synthetic
tests before customer-wide activation. Inventory user and shared mailboxes,
new-user onboarding, excluded resources, ownership, and effective permissions.

A Global Administrator role or a Power Automate license does not itself grant
a mail connector access to everyone's mailbox. Prove the connector's actual
multi-mailbox/evidence/category behavior first. If a scoped Graph worker is
necessary, record the blocker and obtain approval for its permissions, hosting,
and costs before provisioning it. Do not grant mail-sending permission.

License the developer account for development and every user who will actually
run the premium registry app, including the business administrator and approver
when applicable. Do not assume the developer's license covers those users.
Evaluate automated/scheduled flow-owner licensing separately from manually
invoked premium flows, service-principal ownership, and Process licensing.
Passive receipt of a labeled message is not the same as running the app.

Record actual tenant prices, quantities, billing term, renewal behavior,
assignments, and enabled service plans privately. Confirm the exact order
before submission; reuse existing suitable entitlements rather than buying
duplicates. Purchasing a license does not prove assignment or runtime readiness.

## Additional acceptance gates

Add observed results to private pilot evidence, not this public document.

| Scenario | Required result |
| --- | --- |
| A new legitimate customer sends mail before verification | Delivered mail remains available under native policy; unverified presentation cannot imply maliciousness |
| The administrator verifies the customer after delivery | The same retained message is reassessed and, only when eligible, relabeled; no duplicate delivery or unrelated category loss |
| Whole business-domain approval | Exact-domain senders can receive domain-level recognition; arbitrary individuals are not presented as independently verified contacts |
| Exact consumer-provider address approval | The approved address can match; another address at that provider cannot inherit verification |
| Approved identity with spoofing, review signals, or incomplete evidence | No positive presentation, even during retroactive reassessment |
| Revocation/expiry after a positive label | Cached approval stops being used and affected retained presentation is reconciled |
| An authorized registrar creates and verifies an entry | Single-registrar mode permits it only with independent evidence and an audit trail; the actual caller is stamped server-side |
| Multiple registrars use the app | Each has their own licensed identity and appropriate role; no shared credentials or hardcoded account |
| An unauthorized user or a caller claiming another verifier tries to approve | Denied server-side, not just hidden in the UI |
| Independent-review mode is selected | Requester self-approval is denied server-side |
| Another approved user/shared mailbox receives mail | The same policy runs with effective authorized permissions; excluded resources are denied |
| A new employee mailbox is added | Coverage is explicitly enrolled and checked; no claim of automatic protection from a license assignment alone |
| Processing or relabeling fails | Operator-visible error and recovery path; no successful-label claim |

Use the existing [pilot plan](pilot-plan.md) for the full negative security
matrix and separate shadow, visible-label, and production approval gates.

## Microsoft references

- [Power Platform licensing FAQs](https://learn.microsoft.com/power-platform/admin/powerapps-flow-licensing-faq).
- [Power Automate licensing FAQs](https://learn.microsoft.com/power-platform/admin/power-automate-licensing/faqs).
- [Update a Graph message](https://learn.microsoft.com/graph/api/message-update).
- [Exchange application RBAC](https://learn.microsoft.com/exchange/permissions-exo/application-rbac).
