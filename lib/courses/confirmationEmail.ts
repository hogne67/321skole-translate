import type { Firestore } from "firebase-admin/firestore";
import type { SendEmailInput, SendEmailResult } from "../email/resend";

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]!);
}

export function courseConfirmationEmail(input: { email: string; courseTitle: string; courseId: string; origin: string; locale: string }): SendEmailInput {
  const locale = ["nb", "en", "pt"].includes(input.locale) ? input.locale : "nb";
  const copy = {
    nb: { subject: "Du har fått plass", intro: "Påmeldingen din er godkjent", open: "Åpne kursrommet", login: "Logg inn eller opprett en konto med denne e-postadressen", room: "I kursrommet finner du tidspunkt, samlinger og informasjon fra instruktøren. Bli med i videosamlingen derfra når den starter." },
    en: { subject: "Your place is confirmed", intro: "Your registration has been approved", open: "Open the course room", login: "Sign in or create an account with this email address", room: "The course room contains session times and information from the instructor. Join the video session there when it starts." },
    pt: { subject: "A sua vaga está confirmada", intro: "A sua inscrição foi aprovada", open: "Abrir a sala do curso", login: "Inicie sessão ou crie uma conta com este endereço de email", room: "Na sala do curso encontra os horários, as sessões e as informações do instrutor. Entre na sessão de vídeo por lá quando começar." },
  }[locale as "nb" | "en" | "pt"];
  const roomPath = `/${locale}/student/courses/${encodeURIComponent(input.courseId)}`;
  const url = `${new URL(input.origin).origin}/${locale}/login?next=${encodeURIComponent(roomPath)}`;
  return {
    to: input.email,
    subject: `${copy.subject}: ${input.courseTitle}`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h1>${escapeHtml(copy.intro)}</h1><p>${escapeHtml(input.courseTitle)}</p><p><a href="${escapeHtml(url)}">${escapeHtml(copy.open)}</a></p><p>${escapeHtml(copy.login)}: <strong>${escapeHtml(input.email)}</strong>.</p><p>${escapeHtml(copy.room)}</p></div>`,
  };
}

export function courseRequestReceiptEmail(input: { email: string; courseTitle: string; locale: string }): SendEmailInput {
  const copy = {
    nb: { subject: "Vi har mottatt forespørselen din", text: "Du har bedt om plass på kurset nedenfor. Instruktøren må godkjenne påmeldingen. Du får en ny e-post med deltakerlenke når du har fått plass. Dette er ikke en bekreftet plass." },
    en: { subject: "We received your request", text: "You requested a place on the course below. The instructor must approve your registration. You will receive a new email with the participant link when your place is confirmed. This is not a confirmed place." },
    pt: { subject: "Recebemos o seu pedido", text: "Pediu uma vaga no curso abaixo. O instrutor deve aprovar a inscrição. Receberá outro e-mail com o link do participante quando a vaga for confirmada. Esta mensagem não confirma uma vaga." },
  }[input.locale === "en" || input.locale === "pt" ? input.locale : "nb"];
  return { to: input.email, subject: `${copy.subject}: ${input.courseTitle}`, html: `<div style="font-family:Arial,sans-serif;line-height:1.6"><h1>${escapeHtml(copy.subject)}</h1><p>${escapeHtml(input.courseTitle)}</p><p>${escapeHtml(copy.text)}</p></div>` };
}

// Claim the send before contacting the provider; simultaneous clicks cannot both send.
export async function sendCourseConfirmation(args: {
  db: Firestore; courseId: string; requestId: string; origin: string; locale: string;
  send: (input: SendEmailInput) => Promise<SendEmailResult>;
  kind?: "receipt";
  once?: boolean;
}): Promise<"sent" | "failed" | "sending"> {
  const courseRef = args.db.collection("courses").doc(args.courseId);
  const requestRef = courseRef.collection("signupRequests").doc(args.requestId);
  const prefix = args.kind === "receipt" ? "receiptEmail" : "confirmationEmail";
  const claimed = await args.db.runTransaction(async (tx) => {
    const snap = await tx.get(requestRef);
    const data = snap.data();
    if (!data || (args.kind === "receipt" ? !["new", "contacted"].includes(data.status) : data.status !== "accepted")) throw new Error("Request status does not allow this email");
    if (args.once && data[`${prefix}Status`] === "sent") return "sent" as const;
    const attempt = data[`${prefix}AttemptAt`];
    const started = attempt instanceof Date ? attempt.getTime() : attempt?.toDate?.()?.getTime() ?? 0;
    if (data[`${prefix}Status`] === "sending" && Date.now() - started < 5 * 60_000) return null;
    tx.update(requestRef, { [`${prefix}Status`]: "sending", [`${prefix}AttemptAt`]: new Date() });
    return data;
  });
  if (!claimed) return "sending";
  if (claimed === "sent") return "sent";
  let result: SendEmailResult;
  try {
    const course = (await courseRef.get()).data() ?? {};
    const input = {
      email: String(claimed.email), courseTitle: String(course.title || "321Academy"),
      courseId: args.courseId, origin: args.origin, locale: String(claimed.locale || args.locale),
    };
    result = await args.send(args.kind === "receipt" ? courseRequestReceiptEmail(input) : courseConfirmationEmail(input));
  } catch {
    result = { ok: false, reason: "send_failed" };
  }
  const status = result.ok ? "sent" : "failed";
  const now = new Date();
  const batch = args.db.batch();
  batch.update(requestRef, {
    [`${prefix}Status`]: status,
    [`${prefix}Error`]: result.ok ? "" : result.reason,
    ...(result.ok ? { [`${prefix}SentAt`]: now } : {}),
  });
  batch.set(args.db.collection("emailLogs").doc(), {
    type: args.kind === "receipt" ? "course_signup_receipt" : "course_enrollment_confirmation", courseId: args.courseId, requestId: args.requestId,
    to: claimed.email, status, provider: "resend", createdAt: now,
    error: result.ok ? "" : result.reason,
  });
  await batch.commit();
  return status;
}
