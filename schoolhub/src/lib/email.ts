// Phase 1 email stub. No SMTP is wired up; "sending" an email writes it to the
// server console (and callers separately record an audit entry). Swap this for
// a real provider (Postmark, SES, Resend...) in a later phase.

type Mail = { to: string; subject: string; body: string };

export async function sendEmail(mail: Mail): Promise<void> {
  const mode = process.env.EMAIL_MODE ?? "console";
  if (mode === "console") {
    // eslint-disable-next-line no-console
    console.log(
      `\n[email:console] TO: ${mail.to}\n  SUBJECT: ${mail.subject}\n  ${mail.body}\n`
    );
    return;
  }
  // Future: real transport based on EMAIL_MODE.
}
