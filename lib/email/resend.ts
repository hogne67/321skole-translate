import "server-only";
import { getEmailConfiguration } from "./configuration";

export type SendEmailInput = {
  to: string;
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: string; contentType?: string }[];
};

export type SendEmailResult =
  | { ok: true }
  | { ok: false; reason: "email_not_configured" | "send_failed"; error?: string };

export async function sendEmail(input: SendEmailInput): Promise<SendEmailResult> {
  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  const mailFrom = process.env.MAIL_FROM?.trim();

  if (!getEmailConfiguration().configured) {
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
      ...(input.text ? { text: input.text } : {}),
      ...(input.attachments ? { attachments: input.attachments.map(({ contentType, ...attachment }) => ({ ...attachment, ...(contentType ? { content_type: contentType } : {}) })) } : {}),
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
