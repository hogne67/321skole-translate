import "server-only";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
};

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: "email_not_configured" | "send_failed"; error?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY;
  const mailFrom = process.env.MAIL_FROM;

  if (!resendApiKey || !mailFrom) {
    return { ok: false, reason: "email_not_configured" };
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${resendApiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: mailFrom,
      to: [input.to],
      subject: input.subject,
      html: input.html,
    }),
  });

  if (!response.ok) {
    const error = await response.text();

    return {
      ok: false,
      reason: "send_failed",
      error: error.slice(0, 1000),
    };
  }

  return { ok: true };
}
