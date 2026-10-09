export function getEmailConfiguration(env: Record<string, string | undefined> = process.env) {
  const key = env.RESEND_API_KEY?.trim() || "";
  const from = env.MAIL_FROM?.trim() || "";
  const missing = [!key && "RESEND_API_KEY", !from && "MAIL_FROM"].filter(Boolean) as string[];
  const invalid = [
    key && (!key.startsWith("re_") || key.length < 20 || /\s/.test(key)) && "RESEND_API_KEY",
    from && !/(?:^|<)[^<>\s@]+@[^<>\s@]+\.[^<>\s@]+>?$/.test(from) && "MAIL_FROM",
  ].filter(Boolean) as string[];
  // This validates local configuration, not provider permissions or inbox delivery.
  return { configured: missing.length === 0 && invalid.length === 0, missing, invalid };
}
