# Local OpenAI storage-policy tests

These tests never call OpenAI or Firebase. They use synthetic content, a fake fetch transport and the installed OpenAI SDK. `noNetwork.cjs` blocks sockets and DNS (only tsx's named local IPC pipe is allowed).

Keep a full, unchanged source checkout as the baseline and run in the candidate checkout. Both need the existing, locally installed dependencies; no download is required. Point `S03_BASELINE_DIR` at the baseline. For PowerShell:

```powershell
$env:S03_BASELINE_DIR = 'C:\path\to\unchanged-baseline'
node --require ./tests/security03/noNetwork.cjs --test --test-concurrency=1 ./tests/security03/storeFalse.test.cjs
```

The packaged `review-tools/run-check.cjs` reproduces the assessed environment with sibling `baseline/` and `candidate/` checkouts. It strips inherited credentials, supplies a synthetic key and writes checks into its own local folder. It also expects the supplied `changes.json` beside it. Run `node run-check.cjs storage`, `regression`, `types-focused`, `types-full`, `lint`, or `test-lint` from that layout.

Coverage:

- Discover every Responses, Chat Completions and direct Responses fetch call in the application source. Require one literal `store: false` and no request spread that could override it. Reject storage parameters on Images, Audio and Files operations and detect the identified stateful APIs.
- Evaluate all 36 real request-object expressions using synthetic dependencies. Send the 35 SDK bodies through the actual SDK serializer to fake fetch. The direct fetch body is also inspected, and its real route is exercised separately. Compare every non-storage parameter with the unchanged baseline.
- Load selected actual TypeScript routes/helpers with isolated module evaluation and fake authentication/database boundaries: lesson generation, student feedback, parent guidance, translation, direct fetch, generate-text repair and two-stage fact checking. Compare outputs, statuses and console events with baseline, including failure paths.
- Verify that SDK retry preserves `store: false`.

The expression tests do not exercise authorization or Firestore transactions for every route. They are not live endpoint, browser, account-control or production-retention tests. The historical locale producer route still has its original syntax error; only its request expression can be tested. Full TypeScript/lint failure from that unchanged file is documented separately.
