import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { after, before, mock, test } from "node:test";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { NextRequest } from "next/server";
import * as access from "../app/api/parent/spaces/[spaceId]/child-access/route";
import * as connect from "../app/api/child/rooms/[spaceId]/connect/route";
import * as room from "../app/api/child/rooms/[spaceId]/route";
import * as assignment from "../app/api/child/rooms/[spaceId]/assignments/[assignmentId]/route";
import * as feedbackRead from "../app/api/child/rooms/[spaceId]/assignments/[assignmentId]/feedback-read/route";
import * as speech from "../app/api/child/rooms/[spaceId]/assignments/[assignmentId]/speech/route";
import * as followUp from "../app/api/parent/follow-up/route";

const app = initializeApp({ projectId: "demo-family-" + randomUUID().slice(0, 12) });
const db = getFirestore(app);
const context = (spaceId: string, assignmentId = "reading") => ({ params: Promise.resolve({ spaceId, assignmentId }) });

before(async () => {
    assert.equal(process.env.FIRESTORE_EMULATOR_HOST, "127.0.0.1:18198", "Isolated local emulator required");
    mock.method(getAuth(app), "verifyIdToken", async (uid: string) => ({
        uid,
        auth_time: 500,
        firebase: { sign_in_provider: "password" },
    }));
    await Promise.all([
        db.doc("users/owner").set({ role: "parent" }),
        db.doc("users/other").set({ role: "parent" }),
        db.doc("users/teacher").set({ role: "teacher" }),
    ]);
});

after(async () => {
    mock.restoreAll();
    await db.terminate();
    await deleteApp(app);
});

function request({ body, bearer, cookie, origin, host }: { body?: object; bearer?: string; cookie?: string; origin?: string; host?: string } = {}) {
    return new NextRequest("http://localhost:3321/api/family-device-test", {
        method: body ? "POST" : "GET",
        headers: {
            ...(body ? { "Content-Type": "application/json" } : {}),
            ...(bearer ? { Authorization: "Bearer " + bearer } : {}),
            ...(cookie ? { Cookie: cookie } : {}),
            ...(origin ? { Origin: origin } : {}),
            ...(host ? { Host: host } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
    });
}

async function provision(spaceId: string) {
    await db.doc(`spaces/${spaceId}`).set({ ownerId: "owner", kind: "family", isOpen: false, title: "Reading room" });
}

async function invite(spaceId: string, bearer = "owner") {
    const response = await access.POST(request({ bearer, body: { action: "invite" } }), context(spaceId));
    assert.equal(response.status, 200);
    const issued = await response.json();
    assert.ok(issued.inviteExpiresAt > Date.now());
    assert.match(issued.secret, /^[\w-]{43}$/);
    return issued.secret as string;
}

async function redeem(spaceId: string, secret: string) {
    return connect.POST(request({ body: { secret } }), context(spaceId));
}

function sessionCookie(response: Response, spaceId: string) {
    const cookie = response.headers.get("set-cookie") ?? "";
    assert.match(cookie, /HttpOnly/i);
    assert.match(cookie, /SameSite=Strict/i);
    assert.ok(cookie.includes(`Path=/api/child/rooms/${spaceId};`));
    return cookie.split(";")[0];
}

test("a one-time link grants an independent device session scoped to its room and removes no existing work", async (t) => {
    const spaceId = "reading-room";
    await Promise.all([provision(spaceId), provision("another-room")]);
    const lesson = db.doc(`spaces/${spaceId}/lessons/reading`);
    const work = lesson.collection("submissions").doc(`${spaceId}_reading_owner`);
    const index = db.doc(`spaceSubmissions/${work.id}`);
    await Promise.all([
        lesson.set({
            title: "Read and answer",
            tasks: [{ id: "open", type: "open", prompt: "What happened?" }, {
                id: "choice", type: "mcq", options: ["Rain", "Sun"], correctAnswer: "Rain",
            }],
            ownerId: "author-internal",
            sourceId: "unpublished-source",
        }),
        db.doc(`spaces/${spaceId}/lessons/hidden`).set({ title: "Hidden", archived: true }),
        db.doc(`spaces/${spaceId}/goals/goal`).set({ title: "Complete a task", description: "This week", status: "active", targetCount: 1 }),
        work.set({ uid: "owner", answers: { open: "Already saved" }, status: "draft", internalNote: "Private field", createdAt: new Date(1) }),
        lesson.collection("parentReviews").doc("owner").set({ uid: "owner", comment: "From home", stars: 4, internal: "private" }),
    ]);
    assert.equal((await room.GET(request(), context(spaceId))).status, 401);
    assert.equal((await access.POST(request({ bearer: "other", body: { action: "invite" } }), context(spaceId))).status, 403);
    const secret = await invite(spaceId);
    const attempts = await Promise.all([redeem(spaceId, secret), redeem(spaceId, secret)]);
    assert.deepEqual(attempts.map((response) => response.status).sort(), [200, 401]);
    const cookie = sessionCookie(attempts.find((response) => response.ok)!, spaceId);
    const config = db.doc(`spaces/${spaceId}/childAccess/config`);
    assert.ok(!JSON.stringify((await config.get()).data()).includes(cookie.split("=")[1]));
    assert.equal((await room.GET(request({ cookie }), context("another-room"))).status, 401);
    assert.equal((await access.GET(request({ cookie }), context(spaceId))).status, 401);
    assert.equal((await assignment.GET(request({ cookie }), context(spaceId, "hidden"))).status, 404);

    const home = await (await room.GET(request({ cookie }), context(spaceId))).json();
    assert.equal(home.room.title, "Reading room");
    assert.equal(home.goals[0].data.title, "Complete a task");
    assert.equal(home.goals[0].done, 0);
    assert.deepEqual(home.assignments.map(({ id }: { id: string }) => id), ["reading"]);
    assert.equal(home.assignments[0].hasParentFeedback, true);
    assert.equal(home.assignments[0].progress.status, "draft");
    const opened = await (await assignment.GET(request({ cookie }), context(spaceId))).json();
    assert.equal(opened.submission.answers.open, "Already saved");
    assert.deepEqual(opened.parentReview, { comment: "From home", stars: 4 });
    for (const hidden of ["correctAnswer", "author-internal", "unpublished-source", "internalNote", "Private field"]) {
        assert.ok(!JSON.stringify(opened).includes(hidden));
    }

    const secondCookie = sessionCookie(await redeem(spaceId, await invite(spaceId)), spaceId);
    const body = { revision: opened.revision, status: "draft", answers: { open: "Saved on another device" }, childSelfReport: {} };
    const draft = await assignment.POST(request({ cookie, body }), context(spaceId));
    assert.equal(draft.status, 200, await draft.clone().text());
    const edited = await draft.json();
    assert.equal(edited.submission.answers.open, body.answers.open);
    const conflicting = await assignment.POST(request({ cookie: secondCookie, body }), context(spaceId));
    assert.equal(conflicting.status, 409);
    assert.equal((await conflicting.json()).error, "work_conflict");
    const delivered = await assignment.POST(request({
        cookie: secondCookie,
        body: {
            revision: edited.revision, status: "submitted",
            answers: { open: "My answer", choice: "Rain", another: "discard me" },
            childSelfReport: { readAloud: true, comment: "I read it", private: "discard me" },
            uid: "other", auto: { score: 999 },
        },
    }), context(spaceId));
    assert.equal(delivered.status, 200, await delivered.clone().text());
    const result = await delivered.json();
    assert.equal(result.submission.status, "submitted");
    assert.equal(result.submission.auto.score, 1);
    assert.deepEqual(result.submission.answers, { open: "My answer", choice: "Rain" });
    assert.equal(result.submission.childSelfReport.readAloud, true);
    assert.equal((await work.get()).get("uid"), "owner");
    assert.equal((await index.get()).get("status"), "submitted");
    assert.equal((await index.get()).get("createdAt").toMillis(), 1);
    const refreshed = await (await room.GET(request({ cookie }), context(spaceId))).json();
    assert.equal(refreshed.goals[0].done, 1);
    assert.equal((await assignment.POST(request({ cookie, body }), context(spaceId))).status, 409);
    assert.equal((await speech.POST(request({ cookie, body: { mode: "task", taskIndex: 999, text: "arbitrary text" } }), context(spaceId))).status, 400);

    const previousKey = process.env.OPENAI_API_KEY;
    process.env.OPENAI_API_KEY = "isolated-local-speech-test";
    t.after(() => {
        if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
        else process.env.OPENAI_API_KEY = previousKey;
    });
    const provider = t.mock.method(globalThis, "fetch", async (url: string, init: RequestInit) => {
        assert.ok(String(url).endsWith("/audio/speech"));
        assert.equal(JSON.parse(String(init.body)).input, "What happened?");
        return new Response(new Uint8Array([255, 251, 1, 2]), { headers: { "Content-Type": "audio/mpeg" } });
    });
    const audio = await speech.POST(request({ cookie, body: { mode: "task", taskIndex: 0, text: "ignored caption" } }), context(spaceId));
    assert.equal(audio.status, 200, await audio.clone().text());
    assert.match((await audio.json()).url, /^data:audio\/mpeg;base64,/);
    assert.equal(provider.mock.callCount(), 1);

    const status = await (await access.GET(request({ bearer: "owner" }), context(spaceId))).json();
    assert.equal(status.devices.length, 2);
    assert.equal(status.inviteExpiresAt, null);
    assert.ok(status.devices.every((device: object) => !Object.hasOwn(device, "digest")));
    const revoked = await access.POST(request({ bearer: "owner", body: { action: "revoke", deviceId: status.devices[0].id } }), context(spaceId));
    assert.equal(revoked.status, 200);
    assert.equal((await room.GET(request({ cookie }), context(spaceId))).status, 401);
    assert.equal((await assignment.GET(request({ cookie: secondCookie }), context(spaceId))).status, 200);
});

test("a new goal shows its reward and counts recent deliveries even after an assignment is archived", async () => {
    const spaceId = "room-with-goal";
    await provision(spaceId);
    const now = Date.now();
    const countFrom = now - 300_000;
    const space = db.doc(`spaces/${spaceId}`);
    const goalId = "reading-goal";
    const submissions = [
        { id: "old", status: "submitted", submittedAt: countFrom - 1 },
        { id: "new", status: "submitted", submittedAt: now },
        { id: "archived", status: "reviewed", submittedAt: now },
        { id: "draft", status: "draft", submittedAt: 0 },
        { id: "extra", status: "submitted", submittedAt: now },
    ];
    await Promise.all([
        space.update({ activeGoalId: goalId }),
        space.collection("goals").doc(goalId).set({
            title: "Finish two assignments",
            kind: "complete_assignments",
            status: "active",
            reward: "Choose a book to read together",
            createdAt: new Date(countFrom),
            countFrom: new Date(countFrom),
            targetCount: 2,
            assignmentIds: ["old", "new", "archived", "draft"],
        }),
        ...submissions.flatMap(({ id, status, submittedAt }) => {
            const lesson = space.collection("lessons").doc(id);
            return [
                lesson.set({ title: id, ...(id === "archived" ? { archived: true, archivedAt: new Date(now) } : {}) }),
                lesson.collection("submissions").doc(`${spaceId}_${id}_owner`).set({
                    uid: "owner", assignmentId: id, spaceId, status, submittedAt, updatedAt: now,
                }),
            ];
        }),
    ]);

    const cookie = sessionCookie(await redeem(spaceId, await invite(spaceId)), spaceId);
    const response = await room.GET(request({ cookie }), context(spaceId));
    assert.equal(response.status, 200);
    const home = await response.json();
    assert.equal(home.goals[0].data.reward, "Choose a book to read together");
    assert.equal(home.goals[0].done, 2);
    assert.ok(!home.assignments.some(({ id }: { id: string }) => id === "archived"));
});

test("follow-up spans owned rooms and the child can acknowledge the exact greeting on a linked device", async () => {
    const uid = "follow-up-parent";
    const first = "follow-up-first";
    const second = "follow-up-second";
    const foreign = "follow-up-foreign";
    const archived = "follow-up-archived";
    const revoked = "follow-up-revoked";
    await db.doc(`users/${uid}`).set({ role: "parent" });
    await Promise.all([first, second, foreign, archived, revoked].map((id) => db.doc(`spaces/${id}`).set({
        ownerId: id === foreign ? "other" : uid, kind: "family", isOpen: false, title: id, archived: id === archived,
    })));
    await db.doc(`spaceMembers/${revoked}_${uid}`).set({ uid, spaceId: revoked, active: false, status: "revoked" });

    async function lessonWithWork(spaceId: string, lessonId: string, props: object) {
        const lesson = db.doc(`spaces/${spaceId}/lessons/${lessonId}`);
        await lesson.set({ title: lessonId, archived: lessonId === "hidden" });
        await lesson.collection("submissions").doc(`${spaceId}_${lessonId}_${uid}`).set({
            uid, spaceId, assignmentId: lessonId, status: "submitted", isChildPortal: true, answers: { private: "Not returned" },
            ...props,
        });
        return lesson.collection("parentReviews").doc(uid);
    }

    const [pendingReview, oldReview] = await Promise.all([
        lessonWithWork(first, "pending-first", { submittedAt: new Date(1000) }),
        lessonWithWork(first, "answered-before", { submittedAt: new Date(3000) }),
        lessonWithWork(second, "pending-second", { submittedAt: 2000 }),
        lessonWithWork(second, "draft", { status: "draft" }),
        lessonWithWork(second, "parent-work", { isChildPortal: false }),
        lessonWithWork(second, "hidden", {}),
        lessonWithWork(foreign, "other-familys-work", {}),
        lessonWithWork(archived, "archived-room-work", {}),
        lessonWithWork(revoked, "revoked-room-work", {}),
    ]);
    await oldReview.set({ uid, comment: "Older greeting" });
    async function queue() {
        const response = await followUp.GET(request({ bearer: uid }));
        assert.equal(response.status, 200);
        assert.match(response.headers.get("cache-control") ?? "", /no-store/);
        return response.json();
    }
    assert.equal((await followUp.GET(request())).status, 401);
    assert.equal((await followUp.GET(request({ bearer: "teacher" }))).status, 403);
    const initial = await queue();
    assert.equal(initial.roomCount, 2);
    assert.deepEqual(initial.pending.map((item: { assignmentId: string }) => item.assignmentId), ["pending-second", "pending-first"]);
    assert.ok(!JSON.stringify(initial).includes("Not returned"));

    const cookie = sessionCookie(await redeem(first, await invite(first, uid)), first);
    const otherDevice = sessionCookie(await redeem(first, await invite(first, uid)), first);
    const details = context(first, "pending-first");
    const roomView = async (session: string) => (await room.GET(request({ cookie: session }), context(first))).json();
    const roomAssignment = async (lessonId: string, session = cookie) => (await roomView(session)).assignments
        .find((item: { id: string }) => item.id === lessonId);
    await pendingReview.set({ uid, stars: 4, comment: "New greeting", notifyChild: true, updatedAt: new Date() });
    assert.deepEqual((await queue()).pending.map((item: { assignmentId: string }) => item.assignmentId), ["pending-second"]);
    assert.equal((await roomAssignment("answered-before")).unreadFeedbackAt, null);
    assert.equal((await roomAssignment("answered-before")).hasParentFeedback, true);
    assert.ok((await roomAssignment("pending-first")).unreadFeedbackAt > 0);
    const firstGreeting = await (await assignment.GET(request({ cookie }), details)).json();
    assert.ok(firstGreeting.unreadFeedbackRevision);
    assert.equal((await feedbackRead.POST(request({ bearer: uid, body: { revision: firstGreeting.unreadFeedbackRevision } }), details)).status, 401);
    assert.equal((await feedbackRead.POST(request({ cookie, body: { revision: firstGreeting.unreadFeedbackRevision } }), context(second, "pending-second"))).status, 401);

    await pendingReview.update({ comment: "Edited greeting", updatedAt: new Date() });
    const conflicting = await feedbackRead.POST(request({ cookie, body: { revision: firstGreeting.unreadFeedbackRevision } }), details);
    assert.equal(conflicting.status, 409);
    const updated = await (await assignment.GET(request({ cookie }), details)).json();
    assert.notEqual(updated.unreadFeedbackRevision, firstGreeting.unreadFeedbackRevision);
    const seen = () => feedbackRead.POST(request({ cookie, body: { revision: updated.unreadFeedbackRevision } }), details);
    assert.equal((await seen()).status, 200);
    assert.equal((await seen()).status, 200);
    assert.equal((await roomAssignment("pending-first", otherDevice)).unreadFeedbackAt, null);
    const acknowledged = await (await assignment.GET(request({ cookie: otherDevice }), details)).json();
    assert.equal(acknowledged.unreadFeedbackRevision, null);
    assert.equal(acknowledged.parentReview.comment, "Edited greeting");

    await pendingReview.update({ comment: "", stars: 5, updatedAt: new Date() });
    assert.ok((await roomAssignment("pending-first", otherDevice)).unreadFeedbackAt > 0);
});

test("expired, replaced and cancelled links cannot be redeemed, and disabled rooms reject device access", async () => {
    const spaceId = "second-family";
    await provision(spaceId);
    const expired = await invite(spaceId);
    await db.doc(`spaces/${spaceId}/childAccess/config`).update({ "invite.expiresAt": 1 });
    assert.equal((await redeem(spaceId, expired)).status, 401);
    const replaced = await invite(spaceId);
    const current = await invite(spaceId);
    assert.equal((await redeem(spaceId, replaced)).status, 401);
    assert.equal((await connect.POST(request({ body: { secret: current }, origin: "https://different.example" }), context(spaceId))).status, 403);
    assert.equal((await access.POST(request({ bearer: "owner", body: { action: "cancel" } }), context(spaceId))).status, 200);
    assert.equal((await redeem(spaceId, current)).status, 401);

    const secret = await invite(spaceId);
    const response = await connect.POST(request({
        body: { secret }, origin: "http://127.0.0.1:3321", host: "127.0.0.1:3321",
    }), context(spaceId));
    assert.equal(response.status, 200);
    const cookie = sessionCookie(response, spaceId);
    await db.doc(`spaces/${spaceId}`).update({ archived: true });
    assert.equal((await room.GET(request({ cookie }), context(spaceId))).status, 401);
    await db.doc(`spaces/${spaceId}`).update({ archived: false });
    await db.doc("users/owner").update({ authRevokedBefore: Math.floor(Date.now() / 1000) });
    assert.equal((await room.GET(request({ cookie }), context(spaceId))).status, 401);
});
