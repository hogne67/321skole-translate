# Lesson creation

`server/createLessonForUser.ts` is the server-only entry point for creating text
lessons. The caller supplies a **server-verified** Firebase identity, never an
identity read from request JSON. The function loads the account profile, checks
feature eligibility, validates the payload and creates a new draft. No caller
can select the owner, lesson ID, status or publication metadata.

`input.ts` validates the creation payload. `tasks.ts` defines and normalizes the
persisted task format; both the current creation page and the server use it.
Empty task lists, custom/localized text types and beginner-reading fields remain
supported. Missing language/level retain the existing defaults. Task order is
derived from array order, missing task IDs are generated, and boolean true/false
answers are persisted as strings.

Draft creation also accepts optional `tags` (up to 30 nonempty strings of at
most 100 characters), `aiCoverPrompt` (up to 8,000 characters) and
`aiCoverStyle` (`illustration` or `realistic`). Tags are trimmed and deduplicated
without regard to case. A nonempty cover prompt selects AI cover generation,
custom prompt mode and 16:9 format in the existing editor; it does not generate
an image or consume image quota when saving. Omitted metadata remains omitted
so save retries for existing payloads retain their fingerprints.

The existing fact-check metadata contract is preserved. These fields remain
self-reported; they are not server-issued proof of a fact check. An eventual
external adapter must not treat them as such.

Pending fact checks no longer prevent task generation or draft creation. The
lesson editor runs a source-backed, report-only review of text, tasks and keys.
Teachers make corrections themselves and explicitly acknowledge the report.
The review first researches facts, then assesses tasks against their answer keys.
An intentionally false true/false statement keyed false is valid; incorrect
multiple-choice distractors are not treated as factual errors. Review-only task
context supports both boolean and persisted string keys without changing lesson
content or its review fingerprint.
Reviews and acknowledgements are stored server-side in `lessonFactChecks`
(client access is denied by the default Firestore rule). Acknowledgement covers
the current text, supplementary reading text, tasks and answer keys; subsequent
content edits invalidate it at publication time. Older text-hash approvals are
retained for compatibility until a teacher starts the new review flow.

Eligibility uses the existing profile/feature policy. Saving neither reads nor
consumes generation usage, so using the last generation allowance does not
prevent saving the result. Account profile protections and external credentials
are separate concerns; this change does not introduce an external integration.

## Verification

Run `npm run test:lessons` for validation and domain tests. The React server
condition permits loading modules protected by `server-only` in Node tests.

For rule tests, start a local Firestore emulator, then run in PowerShell:

```powershell
$env:FIRESTORE_EMULATOR_HOST = '127.0.0.1:8080'
npm run test:lessons:rules
```

The tests require a local host, use only project `demo-lesson-domain`, load the
repository's complete rules, and reset that test project's database. If Java's
Norwegian locale causes a MissingResourceException in the emulator's rule
compiler, start Java with `-Duser.language=en -Duser.country=US`.

## Deployment and compatibility

- Deploy `firestore.rules` together with the application changes for the access
  restrictions to take effect. No document backfill is required.
- Creation now rejects malformed tasks, unknown fields, non-string text fields,
  invalid language/level values and oversized payloads. Existing stored lessons
  are not rewritten. Limits are 200 tasks, 200,000 source-text characters and
  750,000 UTF-8 bytes for the normalized payload; individual fields also have
  limits in the validators.
- Anonymous accounts, absent/disabled profiles and accounts outside the existing
  feature eligibility policy cannot create lessons.
- Direct reads of another owner's draft or explicitly private lesson now fail.
  Existing public/unlisted/legacy-active lesson reads are retained unless marked
  private. Foreign lesson queries must prove that same access condition.
- Client updates cannot change or remove `ownerId`. Legacy documents without a
  valid owner still require an administrative repair before owner editing works.
- Publication checks the server-side teacher acknowledgement when a new review
  exists. `published_lessons`, Spaces, images and billing logic are unchanged.
  In particular, these rule changes do not redefine privacy
  for published copies or their media assets.
