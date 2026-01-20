const admin = require("firebase-admin");
const serviceAccount = require("./serviceAccountKey.json");

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
});

const db = admin.firestore();

async function run() {
  const lessonId = "dqN1s3q53Tv8xvo5Akut"; // <-- din lesson ID
  const lessonRef = db.collection("lessons").doc(lessonId);

  await lessonRef.collection("tasks").add({
    order: 3,
    type: "open",
    prompt: "Write about a time you learned something new. Write 80–120 words.",
  });

  console.log("✅ Open task added to lesson:", lessonId);
}

run()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("❌ Failed to add open task:", e);
    process.exit(1);
  });
