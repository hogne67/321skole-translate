import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email/resend";

type SchoolOrderPayload = {
  school?: string;
  municipality?: string;
  address?: string;
  place?: string;
  contactName?: string;
  email?: string;
  phone?: string;
  role?: string;
  comment?: string;
  teacherCount?: number;
  monthlyTotal?: number;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim().slice(0, 1000) : "";
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function row(label: string, value: string | number | undefined) {
  const safeValue = value === undefined || value === "" ? "-" : String(value);

  return `<tr><td style="padding:6px 12px 6px 0;font-weight:700;">${escapeHtml(label)}</td><td style="padding:6px 0;">${escapeHtml(safeValue)}</td></tr>`;
}

export async function POST(request: Request) {
  let body: SchoolOrderPayload;

  try {
    body = (await request.json()) as SchoolOrderPayload;
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const school = cleanString(body.school);
  const municipality = cleanString(body.municipality);
  const address = cleanString(body.address);
  const place = cleanString(body.place);
  const contactName = cleanString(body.contactName);
  const email = cleanString(body.email);
  const phone = cleanString(body.phone);
  const role = cleanString(body.role);
  const comment = cleanString(body.comment);
  const teacherCount = Math.max(1, Math.min(200, Number(body.teacherCount) || 1));
  const monthlyTotal = teacherCount * 75;

  if (!school || !municipality || !address || !place || !contactName || !email) {
    return NextResponse.json({ ok: false, error: "missing_required_fields" }, { status: 400 });
  }

  const to = process.env.SCHOOL_ORDER_TO || process.env.CONTACT_EMAIL || "post@321skole.no";
  const subject = `Skolebestilling: ${school}`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a;">
      <h1 style="font-size:22px;">Ny skolebestilling</h1>
      <table style="border-collapse:collapse;">
        ${row("Skole", school)}
        ${row("Kommune", municipality)}
        ${row("Adresse", address)}
        ${row("Poststed", place)}
        ${row("Kontaktperson", contactName)}
        ${row("E-post", email)}
        ${row("Telefon", phone)}
        ${row("Rolle", role)}
        ${row("Antall lærere", teacherCount)}
        ${row("Pris per måned", `${monthlyTotal} kr`)}
      </table>
      <h2 style="margin-top:24px;font-size:16px;">Kommentar</h2>
      <p style="white-space:pre-wrap;">${escapeHtml(comment || "-")}</p>
    </div>
  `;

  const result = await sendEmail({ to, subject, html });

  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.reason },
      { status: result.reason === "email_not_configured" ? 503 : 502 }
    );
  }

  return NextResponse.json({ ok: true });
}
