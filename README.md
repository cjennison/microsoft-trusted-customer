# Microsoft Trusted Customer

A proposed Microsoft 365 and Power Platform system for qualifying incoming
business email against an independently verified client and subcontractor
registry.

**Status:** Reusable development proof, version 0.3.0.0. Seven Dataverse
tables, relationships, and disabled-by-default configuration have been
provisioned in authorized development environments. An offline, synthetic-only
qualification proof policy and an offline verification-transition contract are
available. The transition contract fail-closes unauthorized approval, stamps
the trusted caller, and models evidence, expiry, rejection, and revocation; it
is not deployed Dataverse enforcement. No operational onboarding/review
application, live email classifier, or production deployment exists yet. The
reviewed solution has also been imported into a separately authorized customer
development Sandbox; this is development proof, not operational email tagging.
A disabled, manual-only solution flow now dynamically finds the synthetic proof
folder and exactly one categorized proof message, requests a Graph immutable ID,
uses ETag concurrency, preserves the unrelated `Personal` category, applies only
the non-positive MTC category, verifies the write, and persists metadata-only
`MessageAssessment` state through portable Outlook and Dataverse connection
references. Two repeated runs succeeded while reusing one assessment row. The
solution also includes a second disabled manual proof for one synthetic external
Inbox message. It required exactly one Microsoft receiving
`Authentication-Results` header with SPF, DKIM, DMARC, and composite
authentication pass, confirmed no active approved exact contact, preserved
existing categories, applied `MTC Proof - unrecognized sender`, displayed it in
Outlook web, and persisted one reusable metadata-only unrecognized assessment.
Both flows remain Off. The proof is not a general authentication parser and does
not validate shared/all-mailbox permissions, automatic triggering,
excluded-mailbox denial, or any live positive qualification.

**Documented:** September 30, 2026. Development foundation added October 1,
2026; manual message-runtime proof added October 3, 2026.

## The opportunity

A contractor reported repeated phishing attempts, including a convincing
subcontractor payment request with copied branding and a subtly altered link.
Existing email protections helped flag suspicious messages, but the incident
still nearly caused a high-value payment diversion.

The proposed service adds business context to existing Microsoft protections:
is this the organization, contact, reply address, and payment portal that the
customer independently verified during onboarding?

**Recognizing a sender is not the same as proving an email or payment is safe.**
A lookalike domain can pass email authentication, a legitimate supplier mailbox
can be compromised, and a genuine email can contain a malicious link.

## Answers to the original questions

| Question | Working answer |
| --- | --- |
| Does this already exist? | Microsoft already provides spoofing detection, Defender for Office 365 impersonation protection, safety tips, Safe Links, and Safe Attachments. This proposal adds a business-managed contact registry and explicit payment-verification workflow; it is not a replacement email security product or a claim of a novel detection technique. |
| Is it valuable? | Potentially, especially for accounts payable and contractor/vendor relationships. The value is making impersonation and payment changes harder to act on accidentally, not promising to eliminate phishing. Validate the benefit against a properly configured native Microsoft baseline before investing in custom software. |
| What does it look like? | Microsoft email protection + a verified-party registry in Dataverse + Power Apps onboarding + post-delivery qualification and Outlook categories + independent payment approval. Dynamics 365 can supply existing party records. Copilot Studio is optional, not the trust authority. |

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
schema; `solutions\MicrosoftTrustedCustomer` contains the reviewed dual-format
solution export. PowerShell scripts bootstrap/export through an isolated,
human-authenticated `agent-browser`, and build managed/unmanaged packages using
the repository-pinned Power Platform CLI. The solution flows are disabled
manual synthetic proofs, not arrival triggers or an operational classifier.

Use the same managed release across customers with private per-tenant settings,
not client-specific code branches. Bicep is reserved for Azure resources if a
later Graph worker requires them; it does not package Dataverse solutions.
Follow the replication guide before provisioning anything. Customer records,
current environment variable values, credentials, and browser state stay out
of this public repository.

`src\qualification\proof-policy.js` exercises independently reviewed fixture
identities, exact matches, expiry/revocation, Reply-To and URL checks, incomplete
evidence, and scoped non-positive proof categories. Synthetic recognition
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

Start with a small accounts-payable pilot and a few independently verified
subcontractors. Improve native Microsoft policies first, then assess messages
in shadow mode before displaying qualification labels.

Do not create broad sender allowlists, bypass spam/phishing scanning, automatically
approve payments, or automatically trust contacts learned from incoming email.
Keep client messages, screenshots, contact lists, credentials, and banking details
out of this repository. Use synthetic examples and client-approved restricted
storage for incident evidence.
