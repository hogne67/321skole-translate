/** Emailed invitations must open a public site, including when created from a local development server. */
export function schoolInviteOrigin(baseUrl?: string): string {
  const fallback = "https://321school.com";
  try {
    const url = new URL(baseUrl || fallback);
    if (url.protocol !== "https:" || url.hostname === "localhost" || url.hostname.endsWith(".localhost")
      || /^127\./.test(url.hostname) || ["[::1]", "0.0.0.0"].includes(url.hostname)) return fallback;
    return url.origin;
  } catch { return fallback; }
}
