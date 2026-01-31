import { NextResponse } from "next/server";
import { adminDb } from "@/lib/firebaseAdmin";

/**
 * Server-side "self-heal" for users/{uid}.
 * - Oppretter hvis den ikke finnes
 * - Backfyller defaults hvis roles/teacherStatus/caps mangler
 * Dette kjører med Admin SDK og bypasser Firestore rules (trygt).
 */
const DEFAULT_ROLES = { student: true };
const DEFAULT_TEACHER_STATUS = "none" as const;
const DEFAULT_CAPS = { pdf: true, tts: true, vocab: true, publish: false, sell: false };

type Payload = {
  uid: string;
  email?: string | null;
  displayName?: string | null;
  locale?: string | null;
};

export async function POST(req: Request) {
  let body: Payload;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 });
  }

  const uid = body?.uid;
  if (!uid) return NextResponse.json({ ok: false, error: "Missing uid" }, { status: 400 });

  const ref = adminDb.doc(`users/${uid}`);
  const snap = await ref.get();
  const now = new Date();

  if (!snap.exists) {
    await ref.set(
      {
        email: body.email ?? null,
        displayName: body.displayName ?? null,
        locale: body.locale ?? "no",
        onboardingComplete: true,

        roles: DEFAULT_ROLES,
        teacherStatus: DEFAULT_TEACHER_STATUS,
        caps: DEFAULT_CAPS,

        createdAt: now,
        updatedAt: now,
        lastLoginAt: now,
      },
      { merge: true }
    );

    return NextResponse.json({ ok: true, created: true });
  }

  const data = snap.data() || {};

  // Patch kun det som mangler + oppdater login timestamps.
  const patch: any = {
    updatedAt: now,
    lastLoginAt: now,
  };

  // roles
  if (!data.roles) patch.roles = DEFAULT_ROLES;
  else if (data.roles.student !== true) patch.roles = { ...data.roles, student: true };

  // teacherStatus
  if (!data.teacherStatus) patch.teacherStatus = DEFAULT_TEACHER_STATUS;

  // caps: backfyll manglende nøkler, men bevar eksisterende verdier
  const caps = data.caps || {};
  const mergedCaps = { ...DEFAULT_CAPS, ...caps };
  const capsChanged = !data.caps || JSON.stringify(mergedCaps) !== JSON.stringify(caps);
  if (capsChanged) patch.caps = mergedCaps;

  // hvis ingen reell patch (bortsett fra timestamps)
  const keys = Object.keys(patch);
  const meaningfulKeys = keys.filter((k) => !["updatedAt", "lastLoginAt"].includes(k));
  if (meaningfulKeys.length === 0) {
    // fortsatt oppdater login timestamps
    await ref.set({ updatedAt: now, lastLoginAt: now }, { merge: true });
    return NextResponse.json({ ok: true, patched: false });
  }

  await ref.set(patch, { merge: true });
  return NextResponse.json({ ok: true, patched: true, patchedKeys: keys });
}
