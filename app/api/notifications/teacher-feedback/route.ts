import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { createNotification } from "@/lib/createNotification";

export const runtime = "nodejs";

type Body = {
    spaceId?: string;
    assignmentId?: string;
    subId?: string;
    locale?: string;
};

function normalizeLocale(locale?: string) {
    if (locale === "en" || locale === "pt" || locale === "nb") return locale;
    return "nb";
}

function getStudentUid(subDoc: Record<string, unknown>) {
    const auth = subDoc.auth;

    if (auth && typeof auth === "object") {
        const uid = (auth as { uid?: unknown }).uid;
        if (typeof uid === "string" && uid.trim()) return uid.trim();
    }

    if (typeof subDoc.uid === "string" && subDoc.uid.trim()) return subDoc.uid.trim();
    if (typeof subDoc.studentUid === "string" && subDoc.studentUid.trim()) return subDoc.studentUid.trim();
    if (typeof subDoc.userId === "string" && subDoc.userId.trim()) return subDoc.userId.trim();

    return "";
}

export async function POST(req: Request) {
    try {
        const authHeader = req.headers.get("authorization") || "";
        const token = authHeader.startsWith("Bearer ")
            ? authHeader.slice("Bearer ".length)
            : "";

        if (!token) {
            return NextResponse.json({ ok: false, error: "missing_token" }, { status: 401 });
        }

        const { auth, db } = getAdmin();

        await auth.verifyIdToken(token);

        const body = (await req.json()) as Body;
        const spaceId = body.spaceId?.trim();
        const assignmentId = body.assignmentId?.trim();
        const subId = body.subId?.trim();
        const locale = normalizeLocale(body.locale);

        if (!spaceId || !assignmentId || !subId) {
            return NextResponse.json({ ok: false, error: "missing_fields" }, { status: 400 });
        }

        const subSnap = await db
            .collection("spaces")
            .doc(spaceId)
            .collection("lessons")
            .doc(assignmentId)
            .collection("submissions")
            .doc(subId)
            .get();

        if (!subSnap.exists) {
            return NextResponse.json({ ok: false, error: "submission_not_found" }, { status: 404 });
        }

        const subDoc = subSnap.data() || {};
        const studentUid = getStudentUid(subDoc);

        if (!studentUid) {
            return NextResponse.json({ ok: false, error: "missing_student_uid" }, { status: 400 });
        }

        await createNotification({
            uid: studentUid,
            type: "teacher_feedback",
            title:
                locale === "en"
                    ? "New feedback"
                    : locale === "pt"
                        ? "Novo feedback"
                        : "Ny tilbakemelding",
            body:
                locale === "en"
                    ? "Your teacher has sent feedback on your work."
                    : locale === "pt"
                        ? "Seu professor enviou um feedback sobre sua tarefa."
                        : "Læreren har sendt deg tilbakemelding på oppgaven.",
            link: `/${locale}/student/spaces/${spaceId}/assignments/${assignmentId}?sid=${subId}`,
        });

        return NextResponse.json({ ok: true });
    } catch (error) {
        console.error("teacher feedback notification error", error);
        return NextResponse.json({ ok: false, error: "server_error" }, { status: 500 });
    }
}