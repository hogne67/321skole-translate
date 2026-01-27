import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";

// ⚠️ Juster path hvis nødvendig
import serviceAccount from "./serviceAccountKey.json";

// Init Firebase Admin
if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount as any),
  });
}

const db = getFirestore();

async function backfillTextType() {
  console.log("🔍 Starter backfill av textType…");

  const lessonsSnap = await db.collection("lessons").get();

  let updated = 0;
  let skipped = 0;

  for (const lessonDoc of lessonsSnap.docs) {
    const lessonId = lessonDoc.id;
    const lesson = lessonDoc.data();

    const textType =
      String(lesson.textType ?? lesson.texttype ?? "").trim();

    if (!textType) {
      skipped++;
      continue;
    }

    const pubRef = db.collection("published_lessons").doc(lessonId);
    const pubSnap = await pubRef.get();

    if (!pubSnap.exists) {
      skipped++;
      continue;
    }

    const pubData = pubSnap.data() || {};

    // Ikke overskriv hvis allerede satt
    if (pubData.textType || pubData.texttype) {
      skipped++;
      continue;
    }

    await pubRef.set(
      {
        textType,
        texttype: textType, // legacy-safe
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true }
    );

    updated++;
    console.log(`✅ ${lessonId}: textType = "${textType}"`);
  }

  console.log("—");
  console.log(`🎉 Ferdig`);
  console.log(`✔️ Oppdatert: ${updated}`);
  console.log(`⏭️ Hoppet over: ${skipped}`);
}

backfillTextType()
  .then(() => {
    console.log("🚀 Script fullført");
    process.exit(0);
  })
  .catch((err) => {
    console.error("❌ Feil:", err);
    process.exit(1);
  });
