// scripts/backfillTextType.cjs
/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
const admin = require("firebase-admin");

function loadServiceAccount() {
  const keyPath =
    process.env.SERVICE_ACCOUNT_KEY_PATH ||
    path.join(__dirname, "serviceAccountKey.json");

  if (!fs.existsSync(keyPath)) {
    throw new Error(
      `Fant ikke serviceAccountKey.json. Forventet her: ${keyPath}\n` +
        `Tips: legg filen i scripts/serviceAccountKey.json eller sett SERVICE_ACCOUNT_KEY_PATH.`
    );
  }

  const raw = fs.readFileSync(keyPath, "utf8");
  const sa = JSON.parse(raw);

  // super-sjekk: må ha private_key
  if (!sa.client_email || !sa.project_id || !sa.private_key) {
    throw new Error(
      `Ugyldig service account JSON: mangler client_email / project_id / private_key.\n` +
        `Sjekk at du har lastet ned en ekte "key" fra IAM -> Service Accounts -> Keys.`
    );
  }

  return sa;
}

async function main() {
  const DRY_RUN = String(process.env.DRY_RUN || "0") === "1";

  const serviceAccount = loadServiceAccount();
  console.log("Client email:", serviceAccount.client_email);
  console.log("Project:", serviceAccount.project_id);
  console.log("DRY_RUN:", DRY_RUN ? "ON (no writes)" : "OFF (will write)");

  // ✅ Init admin with explicit cert
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
    });
  }

  // ✅ TOKEN TEST (kritisk)
  console.log("🔐 Tester access token via service account…");
  try {
    const tok = await admin.credential.cert(serviceAccount).getAccessToken();
    console.log("✅ Token OK. expires_in:", tok.expires_in, "token_len:", (tok.access_token || "").length);
  } catch (e) {
    console.error("❌ Kunne ikke hente access token.");
    console.error("Dette betyr nesten alltid: PC-klokka feil, eller private_key/key er ugyldig.");
    throw e;
  }

  const db = admin.firestore();

  console.log("🔍 Starter backfill av textType…");

  // Vi fyller textType i published_lessons ved å hente fra lessons (samme doc-id),
  // og som fallback bruker vi eventuelle felt som allerede finnes.
  const pubSnap = await db.collection("published_lessons").get();

  let scanned = 0;
  let updated = 0;
  let skipped = 0;
  let missing = 0;

  const MAX_BATCH = 450; // trygg margin under 500
  let batch = db.batch();
  let batchCount = 0;

  async function flushBatch() {
    if (batchCount === 0) return;
    if (DRY_RUN) {
      console.log(`(dry-run) ville skrevet ${batchCount} updates`);
    } else {
      await batch.commit();
      console.log(`✅ Skrev batch: ${batchCount}`);
    }
    batch = db.batch();
    batchCount = 0;
  }

  for (const d of pubSnap.docs) {
    scanned++;
    const pub = d.data() || {};
    const pubId = d.id;

    const existing =
      String(pub.textType || "").trim() ||
      String(pub.texttype || "").trim();

    if (existing) {
      skipped++;
      continue;
    }

    // Les fra lessons med samme ID
    const lessonSnap = await db.collection("lessons").doc(pubId).get();
    const lesson = lessonSnap.exists ? (lessonSnap.data() || {}) : null;

    const fromLesson =
      lesson
        ? (String(lesson.textType || "").trim() || String(lesson.texttype || "").trim())
        : "";

    const value = fromLesson;

    if (!value) {
      missing++;
      continue;
    }

    batch.update(d.ref, {
      textType: value,     // ✅ standard
      texttype: value,     // ✅ valgfritt: behold for kompatibilitet
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    batchCount++;
    updated++;

    if (batchCount >= MAX_BATCH) {
      await flushBatch();
    }
  }

  await flushBatch();

  console.log("---- RESULTAT ----");
  console.log("Scanned:", scanned);
  console.log("Updated:", updated);
  console.log("Skipped (already had textType):", skipped);
  console.log("Missing (no textType found in lessons):", missing);

  console.log("✅ Ferdig.");
}

main().catch((e) => {
  console.error("❌ Feil:", e?.message || e);
  process.exit(1);
});
