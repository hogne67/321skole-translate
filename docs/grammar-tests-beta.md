# Setninger og grammatikk (beta)

Entry: `/{locale}/tools/grammar-tests`, linked from the assessment overview.

The first version generates exactly ten Norwegian Bokmål gap sentences. Choose mixed og/å and den/det (five of each), either word pair alone, verb forms, or noun forms. A1 Start–C2 changes vocabulary and surrounding syntax; these focused exercises do not establish a learner's CEFR level.

`lib/grammarTests/targets.ts` supplies reviewed forms and grammatical frames. Generation writes context and explanations. A separate semantic review must accept every item, including all distractors and explanations. Invalid structures, duplicate sentences and failed reviews are rejected. The request has a 110-second total deadline and at most two attempts. Only accepted generation consumes the existing assessment quota.

The teacher can edit all ten items, preview dropdowns, and print a learner sheet and separate key. Teacher edits require teacher review. Learner-preview answers stay in component state.

Saving creates a private `lessons` document with `lessonType: grammar_test`, beta metadata, standard MCQ tasks and a revision token. Reopening and updates require the owner; concurrent revisions cannot overwrite newer edits. Existing account, verification and school/student restrictions apply.

To collect answers: save → share to Space → pupil selects answers → Send til lærer. Spaces stores its ordinary frozen assignment snapshot and submission. The student submission API recomputes grammar marks from the snapshot, and the teacher view independently derives marks from the same tasks. Wrong answers and unanswered items are separate. Existing teacher feedback and review actions remain available. There is no new aggregated learner profile or external message delivery.

Verification:

- `node --import tsx --test lib/grammarTests/grammar.test.tsx lib/readingTests/print.test.tsx lib/listeningTests/listening.test.tsx lib/listeningTests/start.test.tsx`
- Integration tests require an isolated Firestore emulator on `127.0.0.1:8286`, `GOOGLE_CLOUD_PROJECT=demo-grammar-beta-local` and `node --conditions=react-server --import tsx --test lib/grammarTests/spaces.integration.test.ts`.
- Browser QA covers generation, save/reopen, sharing controls, dropdown marking, mobile width and print output. Synthetic live-generation checks cover all three modes and A1 Start/C2.

To extend: add a focus, its labels, a target bank and validation rules; retain a unique answer and independent review. Additional languages need their own grammar rules and target banks.
