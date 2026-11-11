import assert from "node:assert/strict";
import { test } from "node:test";

import { isSpaceAiDisabled, readSchoolAiPolicy } from "./schoolAiPolicy.server";

function database(schools: Record<string, Record<string, unknown>>) {
  return {
    collection: (name: string) => {
      assert.equal(name, "schools");
      return { doc: (id: string) => ({ get: async () => ({ exists: id in schools, data: () => schools[id] }) }) };
    },
  } as Parameters<typeof isSpaceAiDisabled>[0];
}

test("school policy defaults preserve current room behaviour", async () => {
  const db = database({ school: { name: "Synthetic" } });
  assert.deepEqual(readSchoolAiPolicy({}), { lessonFeedbackDisabled: false, writingDisabled: false, version: 0 });
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school", writingAiDisabled: false }, "writing"), false);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school", writingAiDisabled: true }, "writing"), true);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school", lessonAiFeedbackDisabled: true }, "lessonFeedback"), true);
});

test("school restriction overrides a room that permits AI", async () => {
  const db = database({ school: { aiPolicy: { lessonFeedbackDisabled: true, writingDisabled: true, version: 1 } } });
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school", writingAiDisabled: false }, "writing"), true);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school", lessonAiFeedbackDisabled: false }, "lessonFeedback"), true);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: null, writingAiDisabled: false }, "writing"), false);
});

test("broken school binding or malformed policy never enables AI", async () => {
  const db = database({ school: { aiPolicy: "broken" } });
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "missing" }, "writing"), true);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school" }, "lessonFeedback"), true);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "other/school" }, "writing"), true);
  assert.equal(await isSpaceAiDisabled(db, undefined, "writing"), true);
});

test("partial stored school policy does not enable unspecified AI features", async () => {
  const db = database({ school: { aiPolicy: { lessonFeedbackDisabled: false, version: 1 } } });
  assert.deepEqual(readSchoolAiPolicy({ aiPolicy: { lessonFeedbackDisabled: false, version: 1 } }), {
    lessonFeedbackDisabled: true, writingDisabled: true, version: 1,
  });
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school" }, "writing"), true);
  assert.equal(await isSpaceAiDisabled(db, { schoolId: "school" }, "lessonFeedback"), true);
  assert.deepEqual(readSchoolAiPolicy({ aiPolicy: {
    lessonFeedbackDisabled: false, writingDisabled: false, version: "1",
  } }), { lessonFeedbackDisabled: true, writingDisabled: true, version: 0 });
});
