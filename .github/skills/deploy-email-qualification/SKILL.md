---
name: deploy-email-qualification
description: Discover a customer's Microsoft 365 and Power Platform readiness, bootstrap or deploy the reusable email-qualification solution, and gate testing, activation, and rollback. Use when onboarding another customer or continuing this pattern in a tenant.
---

# Deploy the email-qualification pattern

Read `README.md`, `docs/replication-pattern.md`, `docs/solution-design.md`, and
`docs/pilot-plan.md` before operating. Read the implementation status; do not
present the development foundation as a functioning anti-phishing system.

## Invariants

- Use an isolated, named Vercel `agent-browser` session. Never attach to the
  shared CDP endpoint, auto-connect, or use another session's browser.
- Let the administrator sign in and complete MFA directly. Do not request,
  print, export, commit, or reuse passwords, tokens, cookies, or auth state.
- Verify tenant domain/ID and environment ID/type/region/organization ID.
  An environment's display name is not identity proof.
- Keep actual discovery, license assignments, mailbox addresses, screenshots,
  and operational evidence in customer-approved restricted storage. `.local/`
  is Git-ignored working storage, not an approved long-term evidence vault.
- Obtain explicit scope and change authorization. Never buy licenses, activate
  trials/PAYG, enable Managed Environments, modify DLP, or change production
  policies simply to clear a blocker.
- No broad sender allowlist, quarantine release, mail sending/deletion, or Known
  presentation on missing evidence.
- No client branching or hardcoded tenant logic. Reuse the same release and
  schema; bind tenant-local connections/configuration at deployment.

## 1. Discover, read-only

- Open Power Apps and Power Platform admin center; inventory environments,
  Dataverse capacity, region, access, DLP, auditing, and existing solutions.
- In Microsoft 365 admin center, inspect actual license products, recipient/
  flow-owner assignments and enabled service plans, trial expiry, and costs.
  Purchased quantity alone does not prove a user's entitlement.
- Inspect Exchange/Defender licensing, topology, anti-phishing/Safe Links/Safe
  Attachments policy scope and precedence. Record denied access as unknown,
  not "absent" or "secure."
- Identify approved pilot and excluded mailboxes, device/client combinations,
  business administrator, authorized registrars, selected verification mode,
  independent approver where required, operational owner, alert
  destination, retention, and baseline/rollback evidence.
- Compare native configuration alone with the custom registry. Recommend the
  smallest justified route; do not require Azure, Dynamics, or Copilot Studio.
- Stop with explicit gaps if capacity, permissions, licensing, or evidence
  are missing. Do not infer production rights from trials or development rights.
- For a no-purchase proof, verify the current user's completed Developer Plan
  enrollment before premium asset execution. Administrator-created environments,
  successful imports/API calls, and another account's licenses do not prove
  entitlement. If self-service enrollment is blocked, stop live work rather than
  modifying tenant licensing policy or using admin provisioning as a bypass.

## 2. Agree a plan

- Use `config/client.example.json` as a private discovery/decision record.
  State unknowns, proposed changes, prerequisites, cost deltas, and exclusions.
- Ask the customer to choose a development target and approve resource scope.
  Do not reset, replace, convert, or clean an existing environment.
- Use the Dataverse + solution-aware Power Automate route only if the full
  message/evidence/category spike works. Otherwise document the connector
  blocker and seek approval for a scoped Graph/Azure alternative.
- Bootstrap is commercial-cloud Sandbox/Developer only. Sovereign clouds,
  production provisioning, licenses, and environment creation need a separately
  validated procedure; don't weaken the guards to make them work.

## 3. Create the development foundation

- Restore `dotnet tool restore`; run `npm test`.
- Copy `config/development.example.json` to `.local/development.local.json`.
  Populate the verified origin/organization ID, environment type, unique browser
  session and authenticated Dataverse tab ID. Set authorization only after approval.
- Sign in to the Dataverse application origin itself; Power Apps sign-in alone
  does not guarantee same-origin Web API authentication.
- Run `scripts/Initialize-Development.ps1` with the private configuration.
  It uses normal same-origin authentication, not extracted browser tokens.
- Treat its completion report as schema provisioning only. On failure, inspect
  retained components and the browser job status before retrying. Never launch
  duplicate jobs or erase resources to hide a failed attempt.
- Confirm six tables, relationships, four definitions, the custom Graph
  connector/reference, and all three Off flows in the maker portal. For the
  registrar MVP, also confirm the published Sender Registry app, three custom
  APIs, registrar/operator roles, fourteen synchronous guards, and active
  unique address/domain/mailbox keys.
  Keep processing disabled and leave current environment variable values out of
  the development solution that will be exported to public Git.

## 4. Implement the product before activation

- Build registrar/reviewer/service roles, plus distinct requester/approver roles
  where independent-review mode is selected. Enforce the explicitly chosen
  verification mode, registrar membership, evidence, expiry, revocation, and
  actual-verifier audit server-side. Single-registrar mode permits an authorized
  person to create and verify an entry, never to bypass independent ownership
  evidence. Support multiple registrars through local roles/groups, not
  hardcoded identities. Choice fields and offline fixture IDs are not security.
- Verify every app user's entitlement and any incident-related account recovery
  before granting app access. Do not assume a maker's license covers other
  registrars or that MFA enrollment alone proves a compromised account recovered.
- Build solution-aware onboarding and review app/flows. Use connection
  references and environment variable definitions, never tenant constants.
- The live registrar MVP currently supports only explicitly selected
  single-registrar operation. Use `scripts/Deploy-Registrar.ps1` with that
  explicit mode after provisioning the matching development schema. Do not
  imply live independent-review support from the offline fixture contract.
  Verify/Renew/Revoke must use the caller-stamped APIs; direct registry row
  writes and approval relationship changes are intentionally rejected.
- Stage existing mailboxes through the operator API or
  `scripts/Onboard-DevelopmentMailboxes.ps1`. New rows remain Paused. Adding
  enrollment records is not authorization to activate processing or labels.
- Spike trusted receiving-system authentication, exact identity matching,
  assessment persistence, binary category writes, shared mailboxes, and
  excluded-mailbox denial.
- A user-delegated Outlook connection is not an all-mailbox design. For approved
  tenant-wide scope, use a dedicated certificate-authenticated Entra application
  plus Exchange `Application Mail.ReadWrite` RBAC. Do not add unscoped Entra
  mail permissions or grant the developer Full Access to every mailbox.
- Prove an allowed and excluded mailbox first. Then use an Exchange management
  scope covering UserMailbox and SharedMailbox when every current/future mailbox
  is explicitly authorized. Verify both `Test-ServicePrincipalAuthorization`
  and real Graph HTTP results; scope changes can require substantial data-plane
  propagation time even after Exchange reports `InScope=True`.
- Implement the complete deterministic policy, durable idempotency keys,
  retries/reconciliation, revocation invalidation, and operator-visible failures.
  Do not create a demo classifier that claims authentication from arbitrary
  header text or grants Known from missing/conflicting identity evidence.
- Use synthetic registry and message data until authorized pilot testing.
  Enable organization auditing only with explicit approved scope; table audit
  metadata alone does not prove that an audit trail is being captured.
- The offline proof policy cannot authorize a live Known label. Keep captured
  messages Not known until the trusted receiving-system boundary is validated;
  synthetic fixtures and connectivity spikes are not production acceptance.

## 5. Package and deploy

- Export both managed and unmanaged versions from the authoritative development
  solution. Audit the exports for current values, connection IDs, environment
  constants, evidence, users/teams/role assignments, and unrelated dependencies.
- Unpack the reviewed exports into `solutions/MicrosoftTrustedCustomer` using
  the pinned PAC CLI. Generated solution metadata is the portable artifact.
- Run `scripts/Build-Solution.ps1`; publish a reviewed, versioned managed ZIP.
  Preserve the same artifact and SHA-256 across customer deployments.
- Create approved target connections under the correct operational owner and
  record tenant-local PAC deployment settings from the artifact. Solution
  imports do not create OAuth sign-ins or copy Dataverse business data.
- Import the managed artifact into an explicitly verified customer test/pilot
  environment. Use explicit PAC environment parameters, never ambient active
  auth selection. Do not force overwrite, skip dependencies, or activate flows
  as a shortcut. Browser and PAC authentication are separate.
- Configure the actual roles/teams, assignments, connections, auditing,
  retention, alerts, and mailbox scope privately. Keep automation off.

## 6. Test, activate, and hand over

- Record observed results for every acceptance scenario in `docs/pilot-plan.md`.
  Include negative security scenarios, permissions, revocation, duplicates,
  outages, real shared mailboxes, and actual desktop/web/mobile/tablet clients.
- Do not substitute unit tests or an import success for manual end-to-end
  scenario evidence. Set measured latency/workload/coverage thresholds.
- Begin shadow mode only after explicit authorization. Positive labels require
  all applicable scenarios to pass, no negative positive-qualification result,
  working alerts, and customer acceptance of the post-delivery race.
- Obtain separate production/visible-label approval and confirm production
  rights, operating ownership, monitoring, retention, and rollback.
- Supply a restricted customer handover with release/hash, licensed users,
  configured scope, limitations, ongoing costs, runbook, and revocation process.
- Report each stage as completed, failed, blocked, or not started, with evidence.
  No optimistic completion claims.

## 7. Roll back safely

- Disable only the qualification processor/subscriptions and revoke its scoped
  access if retiring it. Remove only service-owned labels when agreed.
- Leave native mail protections and unrelated tenant resources intact.
- Preserve evidence and Dataverse records under the agreed retention policy.
- Uninstalling a managed solution can delete its custom tables and data;
  never use uninstall as a routine version rollback. Obtain a tested data
  backup and explicit destructive-change approval first.
