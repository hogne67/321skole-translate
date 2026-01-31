// lib/userProfile.ts
import type { User } from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type UserProfile = {
  email?: string;
  displayName?: string;
  locale?: string;

  onboardingComplete?: boolean;

  roles?: {
    student?: boolean;
    teacher?: boolean;
    admin?: boolean;
    parent?: boolean;
  };

  teacherStatus?: "none" | "pending" | "approved" | "rejected";

  caps?: {
    publish?: boolean;
    sell?: boolean;
    pdf?: boolean;
    tts?: boolean;
    vocab?: boolean;
  };

  org?: {
    country?: string;
    municipality?: string;
    school?: string;
    orgName?: string;
  };

  publisherAttestation?: {
    acceptedAt?: any;
    version?: number;
  };

  parentOf?: string[];

  createdAt?: any;
  updatedAt?: any;
  lastLoginAt?: any;
};

// ✅ Default caps: typisk MVP (juster om du vil)
const DEFAULT_CAPS: Required<NonNullable<UserProfile["caps"]>> = {
  publish: false,
  sell: false,
  pdf: true,
  tts: true,
  vocab: true,
};

// Fjerner undefined rekursivt (nok for våre use-cases)
function stripUndefinedDeep<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripUndefinedDeep) as any;

  if (value && typeof value === "object") {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      if (v === undefined) continue;
      out[k] = stripUndefinedDeep(v);
    }
    return out;
  }
  return value;
}

/**
 * Ensures /users/{uid} exists + patches safe defaults.
 * Idempotent: safe to call on every login.
 *
 * IMPORTANT:
 * - Roles/teacherStatus/caps "self-heal" skjer server-side via /api/ensure-profile (Admin SDK).
 * - Klient gjør fortsatt identity/timestamps/onboardingComplete + caps-normalisering.
 */
export async function ensureUserProfile(user: User, opts?: { locale?: string }) {
  // ------------------------------------------------------------
  // 0) SERVER-SIDE SELF-HEAL (Admin SDK via API-route)
  //    Dette fikser: manglende roles/student, teacherStatus, caps defaults.
  // ------------------------------------------------------------
  if (typeof window !== "undefined") {
    try {
      await fetch("/api/ensure-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          uid: user.uid,
          email: user.email ?? null,
          displayName: user.displayName ?? null,
          locale: opts?.locale ?? "no",
        }),
      });
    } catch {
      // Ikke blokkér login-flyt hvis route feiler midlertidig
    }
  }

  // ------------------------------------------------------------
  // 1) KLIENT-SIDE PROFILE ENSURE (som før)
  // ------------------------------------------------------------
  const ref = doc(db, "users", user.uid);
  const snap = await getDoc(ref);

  const base: Partial<UserProfile> = {
    email: user.email ?? undefined,
    displayName: user.displayName ?? undefined,
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (opts?.locale) base.locale = opts.locale;

  // ------------------------------------------------------------
  // NEW USER (kan skje hvis API-route ikke rakk / ikke finnes)
  // ------------------------------------------------------------
  if (!snap.exists()) {
    const initial: UserProfile = stripUndefinedDeep({
      ...base,
      onboardingComplete: false, // ny bruker skal til onboarding én gang
      caps: { ...DEFAULT_CAPS },
      org: {},
      createdAt: serverTimestamp(),
    } as any);

    await setDoc(ref, initial as any, { merge: true });
    return;
  }

  // ------------------------------------------------------------
  // EXISTING USER
  // ------------------------------------------------------------
  const current = snap.data() as UserProfile;

  const patch: Partial<UserProfile> = {
    lastLoginAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  if (!current.email && user.email) patch.email = user.email;
  if (!current.displayName && user.displayName) patch.displayName = user.displayName;
  if (!current.locale && opts?.locale) patch.locale = opts.locale;

  // Eksisterende brukere uten onboardingComplete skal IKKE bli sendt til onboarding
  if (current.onboardingComplete === undefined) patch.onboardingComplete = true;

  // Backfill/normalize caps (trygt)
  // - hvis caps mangler: sett defaults
  // - hvis caps finnes: fyll inn manglende keys med defaults og behold eksisterende verdier
  const caps = current.caps || {};
  patch.caps = {
    publish: caps.publish ?? DEFAULT_CAPS.publish,
    sell: caps.sell ?? DEFAULT_CAPS.sell,
    pdf: caps.pdf ?? DEFAULT_CAPS.pdf,
    tts: caps.tts ?? DEFAULT_CAPS.tts,
    vocab: caps.vocab ?? DEFAULT_CAPS.vocab,
  };

  const cleaned = stripUndefinedDeep(patch) as any;
  const keys = Object.keys(cleaned || {});
  if (keys.length === 0) return;

  await updateDoc(ref, cleaned);
}
