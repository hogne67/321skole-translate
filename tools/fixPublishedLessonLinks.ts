/**
 * tools/fixPublishedLessonLinks.ts
 *
 * Kjør:
 *  - npm i -D tsx
 *  - npx tsx tools/fixPublishedLessonLinks.ts
 *
 * Forutsetter at du har admin creds:
 *  - Enten GOOGLE_APPLICATION_CREDENTIALS til service account json
 *  - Eller at du kjører i miljø med ADC (sjeldnere på Windows lokalt)
 */

import admin from "firebase-admin";

function mustGetEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env ${name}`);
  return v;
}

async function main() {
  const projectId = process.env.FIREBASE_PROJECT_ID || "skole-c09b8";

  if (!admin.apps.length) {
    // Hvis du har GOOGLE_APPLICATION_CREDENTIALS satt, funker dette.
    admin.initializeApp({ projectId });
  }

  const db = admin.firestore();

  console.log("Project:", projectId);

  // Finn published docs (du kan filtrere mer om du vil)
  const pubSnap = await db.collection("published_lessons").get();
  console.log("published_lessons docs:", pubSnap.size);

  let fixed = 0;
  let skipped = 0;

  const batchSize = 400;
  let batch = db.batch();
  let batchCount = 0;

  for (const docSnap of pubSnap.docs) {
    const publishedId = docSnap.id;
    const pub = docSnap.data() || {};
    const currentLessonId = typeof pub.lessonId === "string" ? pub.lessonId : "";

    // “feil”-mønsteret hos deg: lessonId == publishedId
    // eller lessonId mangler
    const looksWrong = !currentLessonId || currentLessonId === publishedId;

    if (!looksWrong) {
      skipped++;
      continue;
    }

    // Finn original lesson via activePublishedId
    const q = await db
      .collection("lessons")
      .where("activePublishedId", "==", publishedId)
      .limit(1)
      .get();

    if (q.empty) {
      // Ikke funnet mapping. La den være (kan være gamle eller ubrukte)
      skipped++;
      continue;
    }

    const lessonDoc = q.docs[0];
    const originalLessonId = lessonDoc.id;

    batch.update(docSnap.ref, {
      lessonId: originalLessonId,
      publishedId, // valgfritt, men ryddig
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    batchCount++;
    fixed++;

    if (batchCount >= batchSize) {
      await batch.commit();
      console.log("Committed batch of", batchCount);
      batch = db.batch();
      batchCount = 0;
    }
  }

  if (batchCount > 0) {
    await batch.commit();
    console.log("Committed final batch of", batchCount);
  }

  console.log("Done.");
  console.log("fixed:", fixed, "skipped:", skipped);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});