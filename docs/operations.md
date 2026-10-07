# Operations and troubleshooting

Where to look when something seems wrong. All logs are metadata only (no
message bodies or attachments).

## Health at a glance

- **Sender Registry > Service health / Mailboxes**: per-mailbox health, last
  successful check, and last error. In-app notifications flag failures.
- **MTC Run Log** table (`mtc_runlog`): one row per worker run, kept 90 days
  by a daily bulk-delete job ("MTC run log 90-day retention").
  - *Shadow check* rows: enrolled mailboxes, messages assessed, failed mailboxes.
  - *Outlook labeling* rows: messages processed, failures in that run.
  - `Outcome`, `StartedOn`/`EndedOn`, and `RunId` (open the matching run in
    Power Automate for step-by-step detail; Power Automate keeps 28 days).

## Per-message detail (`mtc_messageassessment`)

| Column | Meaning |
| --- | --- |
| `ReasonCodes` | Deterministic decision trail, e.g. `MTC_ACTIVE_REGISTRY_AND_ALIGNED_RECEIVING_AUTH;MTC_WILDCARD_DOMAIN_MATCH;...` |
| `Decision` | Known sender / Not known |
| `PresentationStatus` | Not attempted, Applied, Failed, or **Not applicable** (deleted, sent, draft, outbox, or Recoverable Items; never labeled or alerted) |
| `FirstPresentedOn` | When the Outlook label was first verified on the message; use it to measure delivery-to-label latency against `ReceivedOn` |
| `LastPresentationError` | Failing step, status, HTTP code, and error message from the last failed attempt; cleared on success |

Failed labels retry every minute for two days, then stop. Shadow overlap
rescans keep an already-applied label when the decision has not changed.

## Audit trail

Dataverse auditing is on (365-day retention) for business parties, approved
contacts and domains, verification cases, and mailbox enrollments: who
approved, renewed, or revoked what, and when. Verification cases also store
the caller-stamped registrar, method, evidence reference, and expiry.
Message assessments and run logs are deliberately not audited (high volume).

## Common checks

- Labels missing on new mail: check the latest Shadow check and Outlook labeling
  rows, then the mailbox's last error. No label means unassessed, never Known.
- A sender should be Known but is not: read the message's `ReasonCodes`; an
  authentication reason (DMARC, receiving boundary) wins over registry approval.
- Repeated alerts: read `LastPresentationError` on the failed assessments.

## Phishing reports (native Microsoft, not MTC)

MTC only labels verified senders; blocking attackers uses Microsoft's own tools.
Per client, with Exchange admin approval:

1. Create a shared mailbox such as `phish-reports@<domain>` (no license) and give
   the registrars Full Access only (no Send As).
2. Register it as a SecOps mailbox (`New-SecOpsOverridePolicy -SentTo` plus
   `New-ExoSecOpsOverrideRule`) so reported phish is delivered unfiltered.
3. Route the built-in **Report** button to Microsoft and that mailbox
   (`Set-ReportSubmissionPolicy -EnableReportToMicrosoft $true` with the
   `Report*Addresses` set, plus `DefaultReportSubmissionRule -SentTo`). Record the
   previous destination first; the default is the global admin's mailbox.
4. Optional fast alert: a cloud flow (outside the MTC solution) triggered by
   *When a new email arrives in a shared mailbox (V2)* that posts the reporter,
   HTML-escaped subject, and the Defender Submissions link to the registrars'
   Teams chat as Flow bot. Never copy the reported body or links into Teams.
5. Registrars review in Defender > Submissions > User reported and **Block**
   (Tenant Allow/Block List). Do not auto-block from user reports; one mistaken
   report would block a real supplier. Revoke the sender in Sender Registry too
   if it was a verified supplier.

Business Standard tenants lack the Defender alert policy *Email reported by user
as malware or phish* (Business Premium / Defender for Office 365 Plan 1); the
reporting mailbox plus flow provides the notification instead.

## Changing mailbox exclusions

`mtc_SetMailboxFolderScope` accepts 4 to 16 distinct folder IDs: Sent Items,
Drafts, Outbox, Deleted Items, plus each mailbox's Recoverable Items folders
(Deletions, Purges, Versions, SubstrateHolds, Calendar Logging, Audits).
