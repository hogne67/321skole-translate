# Email existing teacher invitations

The school teachers page offers **Send email** / **Send again** for each pending
invitation. POST `/api/schools/send-invite-email` accepts only schoolId, inviteId
and locale. It verifies the Firebase token (including revocation), requires an
active school administrator membership and an active school, and checks that
the invitation belongs to that school, is pending and has not expired.

Recipient, name, school, token, code and expiry come from server records. No
client-provided email, attachment, text or link is accepted. Sending preserves
the invitation token, code, expiry and seat reservation. A Firestore transaction
reserves attempts for 60 seconds to prevent concurrent sends/double-clicks.

The localized email includes a greeting, joining instructions, the existing
invitation link, expiry and an actual PDF attachment containing a clickable
link, QR code and manual code. PDF generation uses the existing react-pdf and
qrcode dependencies. Resend receives the PDF as base64, plus HTML/plain text.
The API follows [Resend's attachment contract](https://resend.com/docs/api-reference/emails/send-email).
No external attachment URL is fetched.

Provider acceptance records emailSentAt/emailSentByUid; it does not prove inbox
delivery. Provider/generation failures return an error and never mark the
invitation sent. A metadata-write failure after provider acceptance is logged
without returning a misleading send failure. The UI shows inline feedback and
the latest send time. Email configuration continues to use RESEND_API_KEY and
MAIL_FROM; link origin uses NEXT_PUBLIC_APP_URL or APP_URL, with 321school.com
as the fallback.

## Verification — 2026-10-12

- 13 tests passed across invitation sending, email transport/configuration and
  existing invitation validation. They cover cross-school/non-admin denial,
  expired/accepted invitations, concurrency, PDF attachment encoding, unchanged
  existing tokens and failure reporting. Email transport was mocked.
- Targeted lint, local TypeScript and Vercel build/typecheck passed.
- Rendered the sample PDF and visually verified a clean single A4 page with
  Norwegian characters, QR code, clickable link and manual invitation code.
- Deployed preview `dpl_6YMBfaDHJyXFxWLoQG3VomWj4YVA` to the existing
  `321skole-translate-oauth-staging.vercel.app` alias. Public bundle verification
  found the new button/API call; anonymous POST returned 401. Production was
  not promoted and no real email was sent during verification.

Run the relevant tests with:

```powershell
node --conditions=react-server --import tsx --test lib/schools/server/sendInviteEmail.test.ts lib/email/resend.test.ts lib/email/configuration.test.ts lib/schools/inviteBatch.test.ts
```

User acceptance: sign in as the school's administrator on the test version,
send one intended invitation, verify its email/PDF and check the recipient can
follow the link or scan the QR code. Staging uses the existing Firebase data;
clicking Send email is a real send.
