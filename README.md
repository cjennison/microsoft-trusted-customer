# Microsoft Trusted Customer

A proposed Microsoft 365 and Power Platform system for qualifying incoming
business email against an independently verified client and subcontractor
registry.

**Status:** Client-showable registrar development MVP, version 0.7.0.0.
The published **Sender Registry** model-driven Power App now provides guided
exact-address/business-domain verification, renewal, revocation, mailbox
onboarding/pause/enrollment, and a basic service-health view. Three Dataverse
custom APIs enforce the explicitly selected single-registrar model and separate
operator membership. Fourteen synchronous guards reject direct registry writes,
deletion, and relationship changes; active unique keys prevent duplicate sender
and mailbox identities. New verification events preserve the exact target,
method, evidence reference, expiry, reason, actual caller, and server time.
The authorized development target has staged its existing user/shared
mailboxes in Paused state. Actual app Verify/Renew/Revoke operations and live
negative approval scenarios have been exercised with synthetic data; additional
client users still need entitlement/access confirmation.

Automatic Outlook tagging is **not operational**. All three flows remain Off,
processing mode remains Disabled, and no mailbox is enrolled. The existing
scheduled shadow definition still needs complete receiving-authentication
validation, paging, checkpoint/retry handling, alerts, and retained-message
reconciliation before acceptance or activation. Earlier manual evidence proves
retained-message Not known/Known reassessment, expiry, shared-mailbox category
writes, excluded-mailbox HTTP 403, and all-current-mailbox Graph access.
The environment remains a Sandbox, not a production deployment.

**Documented:** September 30, 2026. Development foundation added October 1,
2026; manual message-runtime proof added October 3, 2026; disabled shadow
runtime foundation and client-showable registrar app added October 4, 2026.

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
schema; `src\registrar-app` and `src\registrar-plugin` implement the guided
app and caller-stamped approval controls; `src\runtime\shadow-flow.js` defines
the disabled scheduled shadow processor; `solutions\MicrosoftTrustedCustomer`
contains the reviewed dual-format solution export. PowerShell scripts bootstrap/export through an
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
mode by default. The live registrar MVP supports only explicitly selected
single-registrar operation through the deployed `MTC Registrar` role and custom
APIs; fixture principal lists cannot grant live access. Live independent-review
mode is not implemented.

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
