import test from "node:test";
import assert from "node:assert/strict";
import { invitationRecipients, sessionInvitationUrl } from "./sessionInvitation";
import { isCourseParticipantPath } from "./participantPaths";

test("invitations deduplicate enrolled addresses and exclude cancelled, completed and invalid recipients", () => {
  assert.deepEqual(invitationRecipients([
    { status: "enrolled", email: " Hogne@example.com " },
    { status: "active", email: "hogne@example.com" },
    { status: "cancelled", email: "cancelled@example.com" },
    { status: "completed", email: "completed@example.com" },
    { status: "enrolled", email: "invalid" },
    { status: "enrolled", email: "" },
    { status: "active", email: "another@example.com" },
  ]), ["another@example.com", "hogne@example.com"]);
});

test("shared and emailed links lead through login to the enrolled session without host credentials", () => {
  for (const locale of ["nb", "en", "pt"]) {
    const url = new URL(sessionInvitationUrl("https://321school.com/", locale, "course123", 2));
    assert.equal(url.pathname, `/${locale}/login`);
    assert.equal(url.searchParams.get("next"), `/${locale}/student/courses/course123/sessions/2`);
    assert.equal(isCourseParticipantPath(url.searchParams.get("next")!, locale), true);
    assert.equal(url.searchParams.size, 1);
  }
});
