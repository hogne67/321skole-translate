import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";

import { sendEmail } from "@/lib/email/resend";
import { getAdmin } from "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type ParentVerificationBody = {
  locale?: string;
};

function getBaseUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.APP_URL ||
    "http://localhost:3000"
  ).replace(/\/$/, "");
}

function normalizeLocale(locale?: string) {
  if (locale === "en" || locale === "pt" || locale === "nb") return locale;
  return "nb";
}

function brandForLocale(locale: string) {
  if (locale === "pt") return "321escola";
  if (locale === "en") return "321school";
  return "321skole";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function bearerToken(req: Request): string | null {
  const header = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function isParentProfile(profile: FirebaseFirestore.DocumentData | undefined) {
  if (!profile) return false;
  if (profile.role === "parent") return true;
  return Boolean(profile.roles && typeof profile.roles === "object" && profile.roles.parent === true);
}

function authErrorCode(error: unknown) {
  if (!error || typeof error !== "object") return "";
  const rec = error as { code?: unknown; message?: unknown; errorInfo?: { code?: unknown; message?: unknown } };
  return String(rec.code || rec.errorInfo?.code || rec.message || rec.errorInfo?.message || "");
}

function emailHtml(params: {
  locale: string;
  displayName: string;
  brand: string;
  verifyUrl: string;
}) {
  const safeName = escapeHtml(params.displayName || "der");
  const safeBrand = escapeHtml(params.brand);
  const safeVerifyUrl = escapeHtml(params.verifyUrl);

  if (params.locale === "en") {
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">Verify your email</h2>
        <p>Hi, ${safeName}!</p>
        <p>Thanks for creating a parent account with ${safeBrand}.</p>
        <p>Click the button below to verify your email address. You can read and view content while waiting, but family rooms and AI tools require a verified email.</p>
        <p>
          <a href="${safeVerifyUrl}" style="display:inline-block;padding:11px 18px;background:#169125;color:#fff;text-decoration:none;border-radius:10px;font-weight:800">
            Verify email
          </a>
        </p>
        <p>If you cannot find this email, please also check spam or junk.</p>
        <p>If the button does not work, copy this link:</p>
        <p style="word-break:break-all">${safeVerifyUrl}</p>
        <p>If you did not request this, you can ignore this email.</p>
        <p>Kind regards,<br />${safeBrand}</p>
      </div>
    `;
  }

  if (params.locale === "pt") {
    return `
      <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
        <h2 style="margin:0 0 12px">Confirme seu e-mail</h2>
        <p>Olá, ${safeName}!</p>
        <p>Obrigado por criar uma conta de responsável na ${safeBrand}.</p>
        <p>Clique no botão abaixo para confirmar seu e-mail. Você pode ler e ver conteúdo enquanto espera, mas salas familiares e ferramentas de IA exigem e-mail confirmado.</p>
        <p>
          <a href="${safeVerifyUrl}" style="display:inline-block;padding:11px 18px;background:#169125;color:#fff;text-decoration:none;border-radius:10px;font-weight:800">
            Confirmar e-mail
          </a>
        </p>
        <p>Se não encontrar este e-mail, verifique também spam/lixo eletrônico.</p>
        <p>Se o botão não funcionar, copie este link:</p>
        <p style="word-break:break-all">${safeVerifyUrl}</p>
        <p>Se você não solicitou isso, pode ignorar este e-mail.</p>
        <p>Atenciosamente,<br />${safeBrand}</p>
      </div>
    `;
  }

  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827;max-width:560px">
      <h2 style="margin:0 0 12px">Bekreft e-posten din</h2>
      <p>Hei, ${safeName}!</p>
      <p>Takk for at du opprettet foreldrekonto hos ${safeBrand}.</p>
      <p>Klikk på knappen under for å bekrefte e-postadressen din. Du kan lese og se innhold mens du venter, men familierom og KI-verktøy krever bekreftet e-post.</p>
      <p>
        <a href="${safeVerifyUrl}" style="display:inline-block;padding:11px 18px;background:#169125;color:#fff;text-decoration:none;border-radius:10px;font-weight:800">
          Bekreft e-post
        </a>
      </p>
      <p>Finner du ikke e-posten, sjekk også søppelpost/junk.</p>
      <p>Hvis knappen ikke virker, kan du kopiere denne lenken:</p>
      <p style="word-break:break-all">${safeVerifyUrl}</p>
      <p>Hvis du ikke har bedt om dette, kan du ignorere denne e-posten.</p>
      <p>Vennlig hilsen<br />${safeBrand}</p>
    </div>
  `;
}

export async function POST(req: Request) {
  const token = bearerToken(req);
  if (!token) {
    return NextResponse.json({ ok: false, error: "missing_token" }, { status: 401 });
  }

  const body = (await req.json().catch(() => ({}))) as ParentVerificationBody;
  const locale = normalizeLocale(body.locale);
  const brand = brandForLocale(locale);
  const subject =
    locale === "pt"
      ? `Confirme seu e-mail para ${brand}`
      : locale === "en"
        ? `Verify your email for ${brand}`
        : `Bekreft e-posten din for ${brand}`;

  const { auth, db } = getAdmin();

  try {
    const decoded = await auth.verifyIdToken(token);
    if (!decoded.email) {
      return NextResponse.json({ ok: false, error: "missing_email" }, { status: 400 });
    }

    const userRecord = await auth.getUser(decoded.uid);
    if (userRecord.emailVerified) {
      return NextResponse.json({ ok: true, alreadyVerified: true });
    }

    const profileSnap = await db.collection("users").doc(decoded.uid).get();
    const profile = profileSnap.data();

    if (!isParentProfile(profile)) {
      return NextResponse.json({ ok: false, error: "not_parent" }, { status: 403 });
    }

    const baseUrl = getBaseUrl();
    const verifyUrl = await auth.generateEmailVerificationLink(decoded.email, {
      url: `${baseUrl}/${locale}/parent`,
      handleCodeInApp: false,
    });

    const displayName =
      typeof profile?.displayName === "string" && profile.displayName.trim()
        ? profile.displayName.trim()
        : userRecord.displayName || decoded.name || decoded.email;

    const result = await sendEmail({
      to: decoded.email,
      subject,
      html: emailHtml({ locale, displayName, brand, verifyUrl }),
    });

    await db.collection("emailLogs").add({
      type: "parent_verification",
      uid: decoded.uid,
      email: decoded.email,
      locale,
      subject,
      provider: "resend",
      status: result.ok ? "sent" : result.reason === "email_not_configured" ? "not_configured" : "failed",
      error: result.ok ? null : result.error || result.reason,
      createdAt: FieldValue.serverTimestamp(),
    });

    if (!result.ok) {
      return NextResponse.json(
        { ok: false, error: result.reason, details: result.error },
        { status: result.reason === "email_not_configured" ? 503 : 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("parent verification email failed", error);
    const code = authErrorCode(error);
    if (code.includes("TOO_MANY_ATTEMPTS_TRY_LATER") || code.includes("too-many-requests")) {
      return NextResponse.json(
        { ok: false, error: "too_many_attempts" },
        { status: 429 }
      );
    }

    return NextResponse.json(
      { ok: false, error: error instanceof Error ? error.message : "server_error" },
      { status: 500 }
    );
  }
}
