# Microsoft Trusted Customer

A proposed Microsoft 365 and Power Platform system for qualifying incoming
business email against an independently verified client and subcontractor
registry.

**Status:** Reusable development proof, version 0.6.0.0. Six Dataverse
tables now include paused-by-default mailbox enrollment/checkpoint health, and
the solution contains two disabled manual proofs plus one disabled five-minute
scheduled shadow flow. A portable custom Microsoft Graph mail connector is
packaged with certificate-only, tenant-supplied authentication; the development
tenant has separately proven a certificate connection authorized only by
Exchange Application RBAC. The shadow flow reads only explicitly enrolled
mailboxes, requests immutable message metadata and internet headers, evaluates
the bounded trusted Microsoft authentication shape and exact contact/domain
registry matches, and creates or updates metadata-only assessments. It has no
Outlook category-write action, no enrolled mailbox records, and has not been
run end to end. Existing manual evidence still proves retained-message Not known
to Known reassessment, expiry back to Not known, shared-mailbox category writes,
excluded-mailbox HTTP 403, and HTTP 200 across all 12 current user/shared
mailboxes after Exchange authorization propagation. All three flows remain Off.
No operational onboarding/review app, production activation, generalized
authentication parser, paging implementation beyond the fail-closed first-page
gate, alert delivery, or production reconciliation is complete.

**Documented:** September 30, 2026. Development foundation added October 1,
2026; manual message-runtime proof added October 3, 2026; disabled shadow
runtime foundation added October 4, 2026.

## The opportunity

A contractor needed a fast, visible way to distinguish known business senders
from email addresses and domains that had not yet been independently approved.
Existing email protections still handle spam, phishing, malware, and suspicious
content; this product adds the missing business-relationship context.

The proposed service asks one bounded question: does this delivered message come
from an independently approved address or business domain with trusted receiving
authentication?

**A known sender is not the same as a safe email.**
A lookalike domain can pass email authentication, a legitimate supplier mailbox
can be compromised, and a genuine email can contain a malicious link.

## Answers to the original questions

| Question | Working answer |
| --- | --- |
| Does this already exist? | Microsoft already provides spoofing detection, Defender for Office 365 impersonation protection, safety tips, Safe Links, and Safe Attachments. This proposal adds a business-managed known-sender registry and Outlook presentation; it is not a replacement email security product. |
| Is it valuable? | Potentially. It gives nontechnical staff an immediate Known sender or Not known indicator while new legitimate contacts remain delivered and available for onboarding. |
| What does it look like? | Microsoft email protection + approved exact contacts/domains in Dataverse + Power Apps onboarding + post-delivery Known/Not known Outlook categories. Dynamics 365 can optionally supply candidate records, but imported records are not automatically approved. |

## Documentation

- [Solution design](docs/solution-design.md): trust model, architecture,
  data model, qualification rules, limitations, and Microsoft sources.
- [Client pilot plan](docs/pilot-plan.md): first-day checklist, decisions,
  phased delivery, acceptance scenarios, and rollback.
- [Email verification workflow](docs/email-verification-workflow.md): simple
  administrator experience, exact-address/domain choices, retained unverified
  mail, after-delivery reassessment, and all-mailbox implementation gates.
- [Replication pattern](docs/replication-pattern.md): tenant discovery,
  development bootstrap, portable solutions, export/build/deployment, and gates.
- [Deployment skill](.github/skills/deploy-email-qualification/SKILL.md):
  repeatable assistant instructions for onboarding another customer.

## Reusable implementation

`src\provisioning\dataverse.js` defines and verifies the shared development
schema; `src\runtime\shadow-flow.js` defines the disabled scheduled shadow
processor; `solutions\MicrosoftTrustedCustomer` contains the reviewed
dual-format solution export. PowerShell scripts bootstrap/export through an
isolated, human-authenticated `agent-browser`, and build managed/unmanaged
packages using the repository-pinned Power Platform CLI. The scheduled flow is
Off and has no enrolled mailboxes; it is not an operational classifier.

Use the same managed release across customers with private per-tenant settings,
not client-specific code branches. Bicep is reserved for Azure resources if a
later Graph worker requires them; it does not package Dataverse solutions.
Follow the replication guide before provisioning anything. Customer records,
current environment variable values, credentials, and browser state stay out
of this public repository.

`src\qualification\proof-policy.js` exercises independently reviewed fixture
identities, exact matches, expiry/revocation, Reply-To checks, trusted
authentication requirements, and binary Known/Not known presentation. Synthetic recognition
cannot be applied to an Outlook message. Captured-message assessment always
remains incomplete until a trusted receiving-system boundary is proven.
The fixture policy supports an explicitly selected single-registrar model and
multiple authorized verifier identifiers, while retaining independent-review
mode by default. Fixture identifiers are not deployed app roles or server-side
verification enforcement.

Developer environment creation, solution import, or successful API access does
not prove the user's license entitlement. Confirm completed Developer Plan
enrollment or appropriate premium rights before running premium assets.

## Initial scope

Start with a small user/shared-mailbox pilot and a few independently verified
customer or subcontractor senders. Improve native Microsoft policies first, then assess messages
in shadow mode before displaying qualification labels.

Do not create broad sender allowlists, bypass spam/phishing scanning, or
automatically trust contacts learned from incoming email. Keep client messages,
screenshots, contact lists, and credentials out of this repository. Use
synthetic examples and client-approved restricted storage for evidence.
