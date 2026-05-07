// app/api/email/welcome/route.ts
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import "@/lib/firebaseAdmin";

export const runtime = "nodejs";

type WelcomeBody = {
    email?: string;
    displayName?: string;
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

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

async function logEmailAttempt(data: {
    type: "welcome";
    email: string;
    locale: string;
    subject: string;
    status: "sent" | "failed" | "not_configured";
    error?: string;
    provider?: "resend";
}) {
    try {
        const db = getFirestore();

        await db.collection("emailLogs").add({
            ...data,
            createdAt: FieldValue.serverTimestamp(),
        });
    } catch (error) {
        console.error("email log error", error);
    }
}

export async function POST(req: Request) {
    let email = "";
    let locale = "nb";
    let subject = "Velkommen til 321";

    try {
        const body = (await req.json()) as WelcomeBody;

        email = body.email?.trim().toLowerCase() || "";
        const displayName = body.displayName?.trim() || "";
        locale = normalizeLocale(body.locale?.trim());

        if (!email) {
            return NextResponse.json(
                { ok: false, error: "missing_email" },
                { status: 400 }
            );
        }

        const auth = getAuth();
        const baseUrl = getBaseUrl();

        let verifyUrl = `${baseUrl}/${locale}/login`;

        try {
            verifyUrl = await auth.generateEmailVerificationLink(email, {
                url: `${baseUrl}/${locale}/login?verified=1`,
                handleCodeInApp: false,
            });
        } catch {
            // Sender fortsatt velkomstmail selv om verifiseringslenke ikke kan lages.
        }

        const firstName = displayName || "der";
        const safeName = escapeHtml(firstName);
        const safeVerifyUrl = escapeHtml(verifyUrl);

        subject =
            locale === "pt"
                ? "Bem-vindo ao 321"
                : locale === "en"
                    ? "Welcome to 321"
                    : "Velkommen til 321";

        const html =
            locale === "pt"
                ? `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Bem-vindo, ${safeName}!</h2>
            <p>Obrigado por se registrar no 321.</p>
            <p>Agora você pode entrar e começar a usar a plataforma.</p>
            <p>
              <a href="${safeVerifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Verificar e-mail
              </a>
            </p>
            <p>Se o botão não funcionar, copie este link:</p>
            <p>${safeVerifyUrl}</p>
          </div>
        `
                : locale === "en"
                    ? `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Welcome, ${safeName}!</h2>
            <p>Thanks for signing up for 321.</p>
            <p>You can now log in and start using the platform.</p>
            <p>
              <a href="${safeVerifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Verify email
              </a>
            </p>
            <p>If the button does not work, copy this link:</p>
            <p>${safeVerifyUrl}</p>
          </div>
        `
                    : `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Velkommen, ${safeName}!</h2>
            <p>Takk for at du registrerte deg på 321.</p>
            <p>Du kan nå logge inn og begynne å bruke plattformen.</p>
            <p>
              <a href="${safeVerifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Bekreft e-post
              </a>
            </p>
            <p>Hvis knappen ikke virker, kan du kopiere denne lenken:</p>
            <p>${safeVerifyUrl}</p>
          </div>
        `;

        const resendApiKey = process.env.RESEND_API_KEY;
        const mailFrom = process.env.MAIL_FROM;

        if (!resendApiKey || !mailFrom) {
            await logEmailAttempt({
                type: "welcome",
                email,
                locale,
                subject,
                status: "not_configured",
                error: "email_not_configured",
                provider: "resend",
            });

            return NextResponse.json({
                ok: false,
                error: "email_not_configured",
            });
        }

        const sendRes = await fetch("https://api.resend.com/emails", {
            method: "POST",
            headers: {
                Authorization: `Bearer ${resendApiKey}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                from: mailFrom,
                to: [email],
                subject,
                html,
            }),
        });

        if (!sendRes.ok) {
            const errorText = await sendRes.text();

            await logEmailAttempt({
                type: "welcome",
                email,
                locale,
                subject,
                status: "failed",
                error: errorText.slice(0, 1000),
                provider: "resend",
            });

            return NextResponse.json(
                { ok: false, error: "send_failed", details: errorText },
                { status: 500 }
            );
        }

        await logEmailAttempt({
            type: "welcome",
            email,
            locale,
            subject,
            status: "sent",
            provider: "resend",
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("welcome email error", error);

        if (email) {
            await logEmailAttempt({
                type: "welcome",
                email,
                locale,
                subject,
                status: "failed",
                error: "server_error",
                provider: "resend",
            });
        }

        return NextResponse.json(
            { ok: false, error: "server_error" },
            { status: 500 }
        );
    }
}