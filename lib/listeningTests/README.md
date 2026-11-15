# Listening assessments, beta

Entry point: `/{locale}/tools/listening-tests`, linked from the assessment overview.

- One single-voice recording per test; A1–C2 and the same three question types as reading tests.
- Generation shares the reading service, validation and independent A2–C2 content review. Listening adds checks against visual information and multiple voices. A failed review cannot return an approved test.
- Speech uses an authenticated, metered endpoint and returns an MP3 without persisting the recording. `OPENAI_LISTENING_MODEL` and `OPENAI_LISTENING_TTS_MODEL` optionally override the configured defaults.
- The teacher can upload audio, edit tasks and choose 1–3 plays. Editing the script, level or language clears the current recording.
- Learner HTML is a self-contained offline activity. It excludes the script, performs scoring in memory, and makes no requests or submissions. Its answer key is necessarily embedded for local scoring; it is intended for classroom practice and teacher-led assessment, not secure examinations.
- Individual mode embeds audio in the HTML. Teacher playback mode excludes it; the teacher plays the separate audio file while learners use either the HTML questions or the printed sheet.
- Save to My Content stores a private `listening_test` lesson, including script and keys. Audio is uploaded directly to private Firebase Storage through a single-use upload session, checked for size, type, privacy and SHA-256 before committing the lesson. Reopening fetches version-bound authenticated audio chunks. Concurrent edits fail rather than overwrite another revision.
- The JSON package remains a **teacher file** with the script, questions, key and audio, usable for offline backup. The beta does not assign tests in Spaces or create learner profiles or learner-result records.
- Printing reuses the assessment worksheet. Learner sheets omit the script; teacher sheets include the script, playback guidance and answer key.

Run the domain and rendering checks with:

```sh
node --import tsx --test lib/listeningTests/*.test.tsx
```

Persistence checks use a local Firestore emulator only (`127.0.0.1:8286`, project `demo-listening-beta-local`) and a controlled Storage transport:

```sh
FIRESTORE_EMULATOR_HOST=127.0.0.1:8286 GOOGLE_CLOUD_PROJECT=demo-listening-beta-local node --conditions=react-server --import tsx --test lib/listeningTests/saved.integration.test.ts
```
