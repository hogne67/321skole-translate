const admin = require("firebase-admin");

const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  // 1️⃣ Opprett lesson
  const lessonRef = await db.collection("lessons").add({
    title: "Test lesson – A2",
    level: "A2",
    sourceLanguage: "en",
    sourceText: "This is a short test text for the learner library.",
    status: "published",
    releaseMode: "TEXT_FIRST",
    publishedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  console.log("Lesson created:", lessonRef.id);

  // 2️⃣ Legg til task
  await lessonRef.collection("tasks").add({
    order: 1,
    type: "truefalse",
    prompt: "The text is written in English.",
    correctAnswer: true,
  });

  console.log("Task added");
}

run().then(() => {
  console.log("Done");
  process.exit(0);
});
