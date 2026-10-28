import assert from "node:assert/strict";
import { test } from "node:test";
import { lastCompletedSchoolMonth, protectSubmissionCount } from "./server/aggregateStatistics";

test("completed reporting month follows Oslo midnight and DST", () => {
  assert.deepEqual(lastCompletedSchoolMonth(new Date("2026-10-15T12:00:00Z")), {
    period: "2026-09", start: Date.parse("2026-08-31T22:00:00Z"), end: Date.parse("2026-09-30T22:00:00Z"),
  });
  assert.deepEqual(lastCompletedSchoolMonth(new Date("2026-03-31T22:30:00Z")), {
    period: "2026-03", start: Date.parse("2026-02-28T23:00:00Z"), end: Date.parse("2026-03-31T22:00:00Z"),
  });
});

test("zero and small counts, few contributors and complementary small groups are suppressed", () => {
  for (const count of [0, 1, 2, 3, 4]) assert.equal(protectSubmissionCount([{ pupils: 10, contributors: count, submissions: count }]), null);
  assert.equal(protectSubmissionCount([{ pupils: 20, contributors: 1, submissions: 100 }]), null);
  for (const noncontributors of [1, 2, 3, 4]) assert.equal(protectSubmissionCount([{ pupils: 5 + noncontributors, contributors: 5, submissions: 20 }]), null);
});

test("a small contributing room suppresses the entire total, with no partial sums", () => {
  assert.equal(protectSubmissionCount([{ pupils: 20, contributors: 10, submissions: 100 }, { pupils: 2, contributors: 2, submissions: 2 }]), null);
  assert.equal(protectSubmissionCount([{ pupils: 20, contributors: 10, submissions: 100 }], true), null);
});

test("large enough groups disclose ranges only", () => {
  assert.deepEqual(protectSubmissionCount([{ pupils: 5, contributors: 5, submissions: 5 }]), { minimum: 5, maximum: 9 });
  assert.deepEqual(protectSubmissionCount([{ pupils: 10, contributors: 5, submissions: 19 }]), { minimum: 15, maximum: 19 });
});
