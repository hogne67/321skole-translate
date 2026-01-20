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
    order: 1,
    type: "truefalse",
    prompt: "The text is written in English.",
    correctAnswer: true,
  });

  await lessonRef.collection("tasks").add({
    order: 2,
    type: "mcq",
    prompt: "What is this lesson?",
    options: ["A test lesson", "A recipe", "A poem", "A math task"],
    correctAnswer: "A test lesson",
  });

  console.log("Added 2 tasks to", lessonId);
}

run().then(() => process.exit(0));
