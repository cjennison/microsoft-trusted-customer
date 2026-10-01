# Microsoft Trusted Customer

- Read the implementation status in README.md and docs/replication-pattern.md.
  Schema provisioning is not a working email classifier or production approval.
- For customer onboarding, follow .github/skills/deploy-email-qualification/SKILL.md.
- Use Vercel agent-browser with an isolated session and pinned tab. Never attach
  to a shared CDP browser or export authentication state.
- Keep tenant/customer data, current environment variable values, mailbox
  addresses, credentials, evidence, and screenshots out of public Git.
- Development bootstrap supports only explicitly authorized commercial-cloud
  Sandbox/Developer targets and checks the exact origin and organization ID.
- Keep native email protections intact. A recognized sender is not a safe email,
  verified human, or approved payment. Missing evidence fails closed.
- Reuse the same managed solution release across customers. Use tenant-local
  connection references and settings rather than per-client code branches.
- Use the repository-pinned CLI via dotnet tool run pac. Do not rely on or
  change another session's active authentication profile.
- Use npm test for provisioning tests and scripts/Build-Solution.ps1 for source
  validation and managed/unmanaged packaging. No npm dependencies are required.
