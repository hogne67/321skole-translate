import assert from "node:assert/strict";
import test from "node:test";
import { evaluatePupilJoin, type JoinMember } from "./spaceJoinPolicy";
const pupil: JoinMember = { role: "student", participantId: "room-A-pupil", displayName: "Yara", studentCode: "ABCDE" };
test("the same pupil keeps one identity across guest and account accesses", () => {
  for (const uid of ["guest", "account"]) {
    const result = evaluatePupilJoin({ ...pupil, uid }, [pupil, { ...pupil, uid: "another" }]);
    assert.ok(!("error" in result));
    assert.equal(result.participantId, "room-A-pupil");
    assert.equal(result.switchRequired, false);
  }
});
test("a code for a different pupil on a shared browser requires an explicit switch", () => {
  const result = evaluatePupilJoin({ ...pupil, participantId: "another-pupil", displayName: "Ali" }, [pupil]);
  assert.ok(!("error" in result));
  assert.equal(result.displayName, "Yara");
  assert.equal(result.currentDisplayName, "Ali");
  assert.equal(result.switchRequired, true);
});
test("removed pupils, missing names and conflicting identities are rejected", () => {
  assert.deepEqual(evaluatePupilJoin(null, [{ ...pupil, archived: true }]), { error: "invalid_student_code" });
  assert.deepEqual(evaluatePupilJoin(null, [{ ...pupil, status: "disabled" }]), { error: "invalid_student_code" });
  assert.deepEqual(evaluatePupilJoin(null, [{ ...pupil, displayName: "" }]), { error: "missing_pupil_name" });
  assert.deepEqual(evaluatePupilJoin(null, [pupil, { ...pupil, participantId: "other" }]), { error: "identity_conflict" });
});
test("room-local names remain independent even for the same account", () => {
  const a = evaluatePupilJoin(null, [{ ...pupil, uid: "same-account" }]);
  const b = evaluatePupilJoin(null, [{ ...pupil, uid: "same-account", participantId: "room-B-pupil", displayName: "FruX" }]);
  assert.ok(!("error" in a) && !("error" in b));
  assert.equal(a.displayName, "Yara"); assert.equal(b.displayName, "FruX");
  assert.notEqual(a.participantId, b.participantId);
});
