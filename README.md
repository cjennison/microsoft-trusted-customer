# Microsoft Trusted Customer

A proposed Microsoft 365 and Power Platform system for qualifying incoming
business email against an independently verified client and subcontractor
registry.

**Status:** Client-showable development MVP, version 0.9.1.0.
The published **Sender Registry** model-driven Power App now provides guided
exact-address/business-domain verification, renewal, revocation, mailbox
onboarding/pause/enrollment, and a basic service-health view. Twelve Dataverse
custom APIs enforce the explicitly selected single-registrar model and separate
operator membership. Fourteen synchronous guards reject direct registry writes,
deletion, and relationship changes; active unique keys prevent duplicate sender
and mailbox identities. New verification events preserve the exact target,
method, evidence reference, expiry, reason, actual caller, and server time.
The authorized development target has enrolled its approved user/shared
mailboxes in metadata-only shadow mode. Actual app Verify/Renew/Revoke operations and live
negative approval scenarios have been exercised with synthetic data; additional
client users still need entitlement/access confirmation.

Automatic **shadow assessment is operational in the authorized development
pilot**: the five-minute worker reads all delivery folders except explicit
outbound/deleted exclusions, follows exact Graph pagination links with immutable
IDs, uses leased overlap checkpoints, persists metadata-only decisions, handles
approval/revocation/expiry reassessment within the approved 30-day window, and
delivers user-specific in-app failure notifications. Case-distinct Graph IDs use
deterministic binary/GUID identities rather than Dataverse's case-insensitive
text matching. A failed page stops its loop without advancing the cursor.

Automatic **visible Outlook tagging is not activated**. The separate
presentation worker remains Off, with `mtc_LabelingMode` Disabled. A specifically
authorized retained synthetic email was tested through current server-side
planning, ETag PATCH, exact readback and actual Outlook web visibility: Not known
to Known after fresh exact-address approval, then back to Not known after
revocation, preserving unrelated categories. The actual enabled Power Automate
worker then passed a separately authorized one-message test through its
certificate connector: Known, protected revocation, and Not known, with successful
native runs, exact server readback, and both states visible in Outlook web.
Its original definition was restored Off with labeling Disabled and the test
contact Revoked. Tenant-wide label execution and production conversion remain
separately gated. The environment remains a Sandbox. Portable
managed/unmanaged artifacts export every flow Off with both modes Disabled.

The current Outlook labels are **✓ Known sender** (blue) and **Unknown sender**
(gray). The real worker displayed both on one authorized retained proof email
in the operator's Outlook web mailbox, including revocation and legacy-label
replacement. Colors were configured in that mailbox's native category list;
no mailbox-settings application permission was added. Other mailboxes/clients
still need category setup and acceptance. The checkmark is our category text,
not a Microsoft verification badge or a safe-email verdict.

Scoped failure/recovery acceptance also passed through the real worker:
an actual category delta with a stale `If-Match` returned HTTP 412 without
changing the label; an incorrect expected readback failed explicitly; the
operator saw an in-app alert; and a correct retry recovered successfully.
The proof contact remains Revoked and the original worker remains Off/Disabled.
These controlled tests do not establish outage, wider mailbox, or client coverage.

**Documented:** September 30, 2026. Development foundation added October 1,
2026; manual message-runtime proof added October 3, 2026; disabled shadow
runtime foundation and client-showable registrar app added October 4, 2026;
operational shadow pilot and controlled visible proof added October 5, 2026.

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
| Is it valuable? | Potentially. It gives nontechnical staff an immediate Known sender or Unknown sender indicator while new legitimate contacts remain delivered and available for onboarding. |
| What does it look like? | Microsoft email protection + approved exact contacts/domains in Dataverse + Power Apps onboarding + post-delivery colored Outlook categories. Dynamics 365 can optionally supply candidate records, but imported records are not automatically approved. |

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
packages using the repository-pinned Power Platform CLI. All portable flows
are Off and contain no mailbox enrollments or tenant current settings. The
authorized development shadow pilot is operational; importing the portable
release alone does not activate processing or authorize visible labels.

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
