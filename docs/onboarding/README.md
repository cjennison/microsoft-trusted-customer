# Customer onboarding package

Reusable, plain-language material for rolling out Known sender labels to a new
client's staff and registrars.

| File | Purpose |
| --- | --- |
| `staff-guide.template.md` | Five-minute guide for all staff, with a registrar section (adding, renewing and revoking senders, the Outlook **Verify sender** button). |
| `announcement-email.template.txt` | Short email that introduces the labels and links to the guide. |

Templates use placeholders such as `{{COMPANY}}`, `{{REGISTRARS}}`,
`{{SUPPORT_CONTACT}}`, `{{REGISTRY_LINK}}` and `{{GUIDE_LINK}}`. Do not commit
filled-in copies: they contain tenant links and names.

## Produce a client package

```powershell
.\scripts\New-OnboardingPackage.ps1 `
  -Company 'Client Name' -SupportContact 'Name (email)' -Registrars 'A, B and C' `
  -RegistryLink 'https://<org>.crm.dynamics.com/main.aspx?appid=<sender-registry-app-id>' `
  -GuideLink '<SharePoint link to the uploaded guide>' -SenderName 'Name' `
  -OutputDirectory '.local\onboarding\<client>'
```

The script writes a Markdown copy, a Word document and the email text beneath
the Git-ignored `.local` folder and refuses to write anywhere else. It fails if
any placeholder is left unfilled. Typical order:

1. Render once without `-GuideLink` and upload the Word document to the client's
   SharePoint (a folder such as *Documents > Sender Registry*).
2. Create a view-only "people in your organization" link. Site membership is
   often narrower than the staff who receive the email.
3. Render again with `-GuideLink` and send the email text from the client's
   support contact.

Optionally pass `-LookalikeExample` with a real lookalike the client has seen;
concrete examples make the payment-verification rule stick. Keep claims in the
guide aligned with the client's accepted scope (for example, which Outlook
clients were verified) and update the template when product behavior changes.
