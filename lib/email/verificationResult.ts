export type VerificationEmailResult = {
  ok: true;
  alreadyVerified: boolean;
  delivery?: "sent" | "recently_sent" | "pending";
  retryAfterSeconds?: number;
};
