export async function requestPasswordReset(email: string, locale: string): Promise<void> {
  const response = await fetch("/api/email/password-reset", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: email.trim(), locale }),
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || result?.ok !== true) throw new Error("password_reset_unavailable");
}
