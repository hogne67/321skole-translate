import { NextResponse } from "next/server";

type DecodedTokenLike = {
  email_verified?: unknown;
  firebase?: {
    sign_in_provider?: unknown;
  };
};

export function needsEmailVerification(decoded: DecodedTokenLike): boolean {
  return decoded.firebase?.sign_in_provider === "password" && decoded.email_verified !== true;
}

export function emailVerificationRequiredResponse() {
  return NextResponse.json(
    {
      error: "EMAIL_VERIFICATION_REQUIRED",
      message: "Verify your email before using AI tools or publishing.",
    },
    { status: 403 }
  );
}

export function emailVerificationRequiredWebResponse() {
  return Response.json(
    {
      error: "EMAIL_VERIFICATION_REQUIRED",
      message: "Verify your email before using AI tools or publishing.",
    },
    { status: 403 }
  );
}
