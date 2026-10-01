# Microsoft Trusted Customer

A proposed Microsoft 365 and Power Platform system for qualifying incoming
business email against an independently verified client and subcontractor
registry.

**Status:** Discovery and pilot design only. No application, mail flow changes,
or client deployment exists in this repository yet.

**Documented:** September 30, 2026. Initial client discovery and pilot work is
planned for October 1, 2026.

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

## Initial scope

Start with a small accounts-payable pilot and a few independently verified
subcontractors. Improve native Microsoft policies first, then assess messages
in shadow mode before displaying qualification labels.

Do not create broad sender allowlists, bypass spam/phishing scanning, automatically
approve payments, or automatically trust contacts learned from incoming email.
Keep client messages, screenshots, contact lists, credentials, and banking details
out of this repository. Use synthetic examples and client-approved restricted
storage for incident evidence.
