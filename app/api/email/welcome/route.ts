// app/api/email/welcome/route.ts
import { NextResponse } from "next/server";
import { FieldValue } from "firebase-admin/firestore";
import { getAdmin } from "@/lib/firebaseAdmin";

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
        const { db } = getAdmin();

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

        const { auth } = getAdmin();
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
        const brand = brandForLocale(locale);
        const safeBrand = escapeHtml(brand);

        subject =
            locale === "pt"
                ? `Confirme seu e-mail para ${brand}`
                : locale === "en"
                    ? `Verify your email for ${brand}`
                    : `Bekreft e-posten din for ${brand}`;

        const html =
            locale === "pt"
                ? `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Confirme seu e-mail</h2>
            <p>Olá, ${safeName}!</p>
            <p>Obrigado por criar uma conta na ${safeBrand}. Clique no botão abaixo para confirmar seu e-mail antes de entrar.</p>
            <p>
              <a href="${safeVerifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Confirmar e-mail
              </a>
            </p>
            <p>Se você não solicitou esta conta, pode ignorar este e-mail.</p>
            <p>Se não encontrar o e-mail na caixa de entrada, verifique também spam/lixo eletrônico.</p>
            <p>Se o botão não funcionar, copie este link:</p>
            <p>${safeVerifyUrl}</p>
            <p>Atenciosamente,<br />${safeBrand}</p>
          </div>
        `
                : locale === "en"
                    ? `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Verify your email</h2>
            <p>Hi, ${safeName}!</p>
            <p>Thanks for creating an account with ${safeBrand}. Click the button below to verify your email before logging in.</p>
            <p>
              <a href="${safeVerifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Verify email
              </a>
            </p>
            <p>If you did not request this account, you can ignore this email.</p>
            <p>If you cannot find the email in your inbox, please also check spam or junk.</p>
            <p>If the button does not work, copy this link:</p>
            <p>${safeVerifyUrl}</p>
            <p>Kind regards,<br />${safeBrand}</p>
          </div>
        `
                    : `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Bekreft e-posten din</h2>
            <p>Hei, ${safeName}!</p>
            <p>Takk for at du opprettet konto hos ${safeBrand}. Klikk på knappen under for å bekrefte e-posten før du logger inn.</p>
            <p>
              <a href="${safeVerifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Bekreft e-post
              </a>
            </p>
            <p>Hvis du ikke har bedt om denne kontoen, kan du ignorere denne e-posten.</p>
            <p>Finner du ikke e-posten i innboksen, sjekk også søppelpost/junk.</p>
            <p>Hvis knappen ikke virker, kan du kopiere denne lenken:</p>
            <p>${safeVerifyUrl}</p>
            <p>Vennlig hilsen<br />${safeBrand}</p>
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

            return NextResponse.json(
                {
                    ok: false,
                    error: "email_not_configured",
                },
                { status: 503 }
            );
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
