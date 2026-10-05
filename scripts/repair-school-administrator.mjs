import nextEnv from "@next/env";
import fs from "node:fs";
import { initializeApp, cert } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, FieldValue } from "firebase-admin/firestore";

nextEnv.loadEnvConfig(process.cwd());
const [schoolId, email, mode] = process.argv.slice(2);
if (!schoolId || !email) throw new Error("Usage: node scripts/repair-school-administrator.mjs SCHOOL_ID EMAIL [--apply]");
const serviceAccount = process.env.FIREBASE_ADMIN_SA_JSON ? JSON.parse(process.env.FIREBASE_ADMIN_SA_JSON) :
  process.env.FIREBASE_ADMIN_SA_PATH ? JSON.parse(fs.readFileSync(process.env.FIREBASE_ADMIN_SA_PATH, "utf8")) : {
    project_id: process.env.FIREBASE_ADMIN_PROJECT_ID,
    client_email: process.env.FIREBASE_ADMIN_CLIENT_EMAIL,
    private_key: process.env.FIREBASE_ADMIN_PRIVATE_KEY,
  };
serviceAccount.private_key = serviceAccount.private_key.replace(/\\n/g, "\n");
initializeApp({ credential: cert(serviceAccount) });
const account = await getAuth().getUserByEmail(email);
if (account.disabled) throw new Error("User account is disabled");
const db = getFirestore();
const schoolRef = db.collection("schools").doc(schoolId);
const profileRef = db.collection("users").doc(account.uid);
const normalize = (uid) => uid.trim().replace(/^uid\s*:\s*/i, "").trim();
await db.runTransaction(async (transaction) => {
  const [school, profile, members] = await Promise.all([
    transaction.get(schoolRef), transaction.get(profileRef), transaction.get(schoolRef.collection("members")),
  ]);
  if (!school.exists) throw new Error("School not found");
  if (profile.get("disabled") === true) throw new Error("User profile is disabled");
  if (profile.get("schoolId") && profile.get("schoolId") !== schoolId && profile.get("schoolStatus") === "active") {
    throw new Error("User already has active access to another school");
  }
  const matching = members.docs.filter((member) =>
    normalize(member.id) === account.uid && member.get("role") === "school_admin" && member.get("status") === "active" &&
    member.get("email")?.toLowerCase() === account.email.toLowerCase());
  if (matching.length !== 1) throw new Error("Expected exactly one existing administrator matching this account");
  const source = matching[0];
  console.log(JSON.stringify({ mode: mode === "--apply" ? "apply" : "dry-run", schoolId, uid: account.uid, sourceMemberId: source.id }));
  if (mode !== "--apply") return;
  const now = FieldValue.serverTimestamp();
  transaction.set(schoolRef.collection("members").doc(account.uid), {
    ...source.data(), uid: account.uid, updatedAt: now,
  }, { merge: true });
  if (source.id !== account.uid) transaction.delete(source.ref);
  transaction.set(profileRef, { schoolId, schoolRole: "school_admin", schoolStatus: "active", updatedAt: now }, { merge: true });
  if (normalize(school.get("createdByUid") ?? "") === account.uid) {
    transaction.update(schoolRef, { createdByUid: account.uid, updatedAt: now });
  }
  transaction.set(db.collection("adminAuditEvents").doc(), {
    type: "school_administrator_repaired", source: "maintenance_script", schoolId,
    targetUid: account.uid, previousMemberId: source.id,
    previousSchoolId: profile.get("schoolId") ?? null, previousSchoolRole: profile.get("schoolRole") ?? null,
    previousSchoolStatus: profile.get("schoolStatus") ?? null, createdAt: now,
  });
});
const profile = await profileRef.get();
console.log(JSON.stringify({ schoolId: profile.get("schoolId"), schoolRole: profile.get("schoolRole"), schoolStatus: profile.get("schoolStatus") }));
