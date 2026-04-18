// app/api/email/welcome/route.ts
import { NextResponse } from "next/server";
import { getAuth } from "firebase-admin/auth";
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

function escapeHtml(value: string) {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#039;");
}

export async function POST(req: Request) {
    try {
        const body = (await req.json()) as WelcomeBody;
        const email = body.email?.trim().toLowerCase();
        const displayName = body.displayName?.trim() || "";
        const locale = body.locale?.trim() || "nb";

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
            // Hvis bruker ikke finnes ennå eller link ikke kan lages,
            // sender vi fortsatt velkomstmail uten verifiseringslenke.
        }

        const firstName = displayName || "der";
        const safeName = escapeHtml(firstName);

        const subject =
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
              <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Verificar e-mail
              </a>
            </p>
            <p>Se o botão não funcionar, copie este link:</p>
            <p>${escapeHtml(verifyUrl)}</p>
          </div>
        `
                : locale === "en"
                    ? `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Welcome, ${safeName}!</h2>
            <p>Thanks for signing up for 321.</p>
            <p>You can now log in and start using the platform.</p>
            <p>
              <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Verify email
              </a>
            </p>
            <p>If the button does not work, copy this link:</p>
            <p>${escapeHtml(verifyUrl)}</p>
          </div>
        `
                    : `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111">
            <h2>Velkommen, ${safeName}!</h2>
            <p>Takk for at du registrerte deg på 321.</p>
            <p>Du kan nå logge inn og begynne å bruke plattformen.</p>
            <p>
              <a href="${verifyUrl}" style="display:inline-block;padding:10px 16px;background:#2563eb;color:#fff;text-decoration:none;border-radius:8px">
                Bekreft e-post
              </a>
            </p>
            <p>Hvis knappen ikke virker, kan du kopiere denne lenken:</p>
            <p>${escapeHtml(verifyUrl)}</p>
          </div>
        `;

        const resendApiKey = process.env.RESEND_API_KEY;
        const mailFrom = process.env.MAIL_FROM;

        if (!resendApiKey || !mailFrom) {
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
            return NextResponse.json(
                { ok: false, error: "send_failed", details: errorText },
                { status: 500 }
            );
        }

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("welcome email error", error);
        return NextResponse.json(
            { ok: false, error: "server_error" },
            { status: 500 }
        );
    }
}