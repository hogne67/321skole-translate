import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { after, before, mock, test } from "node:test";
import { assertFails, assertSucceeds, initializeTestEnvironment } from "@firebase/rules-unit-testing";
import { deleteApp, initializeApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";
import { deleteField, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { NextRequest } from "next/server";
import * as access from "../app/api/parent/spaces/[spaceId]/child-access/route";
import * as goals from "../app/api/parent/spaces/[spaceId]/goals/route";
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

function request({ body, bearer, cookie, origin, host, method }: { body?: object; bearer?: string; cookie?: string; origin?: string; host?: string; method?: string } = {}) {
    return new NextRequest("http://localhost:3321/api/family-device-test", {
        method: method ?? (body ? "POST" : "GET"),
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

test("a completed goal keeps its reward when the parent starts another goal", async () => {
    const spaceId = "goal-history";
    await provision(spaceId);
    const space = db.doc(`spaces/${spaceId}`);
    const history = space.collection("goals");
    const lesson = space.collection("lessons").doc("reading");
    const reward = "Choose a book to read together";
    const firstGoal = { title: "Finish the reading assignment", targetCount: 1, reward };
    const createGoal = (body: object, bearer = "owner") => goals.POST(request({ bearer, body }), context(spaceId));
    assert.equal((await goals.POST(request({ body: firstGoal }), context(spaceId))).status, 401);
    assert.equal((await createGoal(firstGoal, "other")).status, 403);
    assert.equal((await createGoal({ ...firstGoal, targetCount: 0 })).status, 400);

    const created = await createGoal(firstGoal);
    assert.equal(created.status, 201);
    const { id: firstId } = await created.json();
    await lesson.set({ title: "Reading", tasks: [{ id: "open", type: "open", prompt: "What happened?" }] });
    const cookie = sessionCookie(await redeem(spaceId, await invite(spaceId)), spaceId);
    const readGoals = async () => {
        const res = await room.GET(request({ cookie }), context(spaceId));
        assert.equal(res.status, 200);
        return (await res.json()).goals;
    };
    const delivered = await assignment.POST(request({
        cookie, body: { status: "submitted", revision: null, answers: { open: "My answer" }, childSelfReport: {} },
    }), context(spaceId));
    assert.equal(delivered.status, 200);
    assert.equal((await readGoals())[0].data.status, "completed");

    const replacements = await Promise.all([
        createGoal({ title: "Start a second goal", targetCount: 2, reward: "Go to the library" }),
        createGoal({ title: "Start a third goal", targetCount: 2 }),
    ]);
    assert.deepEqual(replacements.map((res) => res.status), [201, 201]);
    const stored = (await history.doc(firstId).get()).data();
    assert.ok(stored);
    assert.equal(stored.status, "completed");
    assert.equal(stored.reward, reward);
    assert.ok(stored.completedAt.toMillis() >= stored.createdAt.toMillis());
    assert.equal((await history.where("status", "==", "active").get()).size, 1);
    const abandoned = await history.where("status", "==", "archived").get();
    assert.equal(abandoned.size, 1);
    assert.equal(abandoned.docs[0].get("completedAt"), null);

    await lesson.delete();
    const visible = await readGoals();
    const completed = visible.find(({ id }: { id: string }) => id === firstId);
    assert.equal(completed.data.status, "completed");
    assert.equal(completed.data.reward, reward);
    assert.equal(visible.find(({ data }: { data: { status: string } }) => data.status === "active").done, 0);
    assert.equal(visible.length, 2);
});

test("the room parent can mark a reached reward as given once, and the child sees it in history", async () => {
    const spaceId = "reward-status";
    await provision(spaceId);
    const space = db.doc(`spaces/${spaceId}`);
    const reward = "Choose a book to read together";
    const created = await goals.POST(request({
        bearer: "owner", body: { title: "Finish a reading assignment", targetCount: 1, reward },
    }), context(spaceId));
    assert.equal(created.status, 201);
    const { id } = await created.json();
    const goalRef = space.collection("goals").doc(id);
    const lesson = space.collection("lessons").doc("reading");
    await lesson.set({ title: "Reading", tasks: [{ id: "open", type: "open", prompt: "What happened?" }] });
    const cookie = sessionCookie(await redeem(spaceId, await invite(spaceId)), spaceId);
    const mark = (bearer?: string, goalId = id) => goals.PATCH(request({
        bearer, cookie, method: "PATCH", body: { goalId },
    }), context(spaceId));
    assert.equal((await mark()).status, 401);
    assert.equal((await mark("other")).status, 403);
    assert.equal((await goals.GET(request({ bearer: "other" }), context(spaceId))).status, 403);
    assert.equal((await mark("owner")).status, 409);

    await space.collection("goals").doc("no-reward").set({
        title: "Old custom goal", status: "completed", kind: "custom",
    });
    assert.equal((await mark("owner", "no-reward")).status, 409);

    const delivered = await assignment.POST(request({
        cookie, body: { status: "submitted", revision: null, answers: { open: "My answer" }, childSelfReport: {} },
    }), context(spaceId));
    assert.equal(delivered.status, 200);
    const listed = await goals.GET(request({ bearer: "owner" }), context(spaceId));
    assert.equal(listed.status, 200);
    const { goals: available } = await listed.json();
    assert.equal(available.find((goal: { id: string }) => goal.id === id).data.status, "completed");
    assert.equal((await goalRef.get()).get("status"), "active");

    const marks = await Promise.all([mark("owner"), mark("owner")]);
    assert.deepEqual(marks.map((res) => res.status), [200, 200]);
    const [{ rewardGivenAt }, retry] = await Promise.all(marks.map((res) => res.json()));
    assert.equal(typeof rewardGivenAt, "number");
    assert.ok(rewardGivenAt > 0);
    assert.equal(retry.rewardGivenAt, rewardGivenAt);
    const stored = await goalRef.get();
    assert.equal(stored.get("rewardGivenAt").toMillis(), rewardGivenAt);
    assert.equal(stored.get("status"), "completed");

    const next = await goals.POST(request({
        bearer: "owner", body: { title: "Start a new goal", targetCount: 2, reward: "Choose a game" },
    }), context(spaceId));
    assert.equal(next.status, 201);
    await lesson.delete();
    const response = await room.GET(request({ cookie }), context(spaceId));
    assert.equal(response.status, 200);
    const home = await response.json();
    const marked = home.goals.find((goal: { id: string }) => goal.id === id);
    assert.equal(marked.data.reward, reward);
    assert.equal(marked.data.rewardGivenAt, rewardGivenAt);
    assert.equal(home.goals.find((goal: { data: { status: string } }) => goal.data.status === "active").data.rewardGivenAt, undefined);
});

test("a parent can undo the same reward marker twice without clearing a newer one", async () => {
    const spaceId = "reward-undo";
    const goalId = "completed-goal";
    const reward = "Choose a book";
    await provision(spaceId);
    const goal = db.doc(`spaces/${spaceId}/goals/${goalId}`);
    await goal.set({ title: "Read a book", status: "completed", kind: "custom", reward });
    const cookie = sessionCookie(await redeem(spaceId, await invite(spaceId)), spaceId);
    const change = (body: object, bearer?: string) => goals.PATCH(request({
        bearer, cookie, method: "PATCH", body: { goalId, ...body },
    }), context(spaceId));
    const first = await change({}, "owner");
    assert.equal(first.status, 200);
    const { rewardGivenAt } = await first.json();
    assert.ok(rewardGivenAt > 0);

    // An older client could archive an already completed goal that has no completion date.
    await goal.update({ status: "archived" });
    const undo = { given: false, expectedRewardGivenAt: rewardGivenAt };
    assert.equal((await change(undo)).status, 401);
    assert.equal((await change(undo, "other")).status, 403);
    assert.equal((await change({ given: false }, "owner")).status, 400);
    assert.equal((await goal.get()).get("rewardGivenAt").toMillis(), rewardGivenAt);

    const responses = await Promise.all([change(undo, "owner"), change(undo, "owner")]);
    assert.deepEqual(responses.map((response) => response.status), [200, 200]);
    assert.deepEqual(await Promise.all(responses.map((response) => response.json())), [{ rewardGivenAt: null }, { rewardGivenAt: null }]);
    const stored = await goal.get();
    assert.equal(stored.get("rewardGivenAt"), undefined);
    assert.equal(stored.get("status"), "completed");
    const response = await room.GET(request({ cookie }), context(spaceId));
    assert.equal(response.status, 200);
    const home = await response.json();
    assert.equal(home.goals[0].data.status, "completed");
    assert.equal(home.goals[0].data.reward, reward);
    assert.equal(home.goals[0].data.rewardGivenAt, undefined);

    const givenAgain = await change({ given: true }, "owner");
    assert.equal(givenAgain.status, 200);
    const { rewardGivenAt: later } = await givenAgain.json();
    assert.notEqual(later, rewardGivenAt);
    const staleUndo = await change(undo, "owner");
    assert.equal(staleUndo.status, 409);
    assert.equal((await staleUndo.json()).error, "reward_status_changed");
    assert.equal((await goal.get()).get("rewardGivenAt").toMillis(), later);
});

test("client rules preserve a given reward and reject writing the server's marker", async (t) => {
    const spaceId = "reward-rules";
    await provision(spaceId);
    const projectId = app.options.projectId;
    assert.ok(projectId);
    const env = await initializeTestEnvironment({
        projectId,
        firestore: { host: "127.0.0.1", port: 18198, rules: await readFile("firestore.rules", "utf8") },
    });
    t.after(() => env.cleanup());
    const firestore = env.authenticatedContext("owner").firestore();
    const goal = doc(firestore, "spaces", spaceId, "goals", "sample");
    const now = new Date();
    const data = { title: "Reading", reward: "Choose a book", status: "active", kind: "complete_assignments",
        targetCount: 1, createdByUid: "owner", createdAt: now, updatedAt: now };
    await assertFails(setDoc(goal, { ...data, rewardGivenAt: now }));
    await assertSucceeds(setDoc(goal, data));
    await assertFails(updateDoc(goal, { rewardGivenAt: now }));

    await db.doc(goal.path).update({ rewardGivenAt: now });
    await assertSucceeds(updateDoc(goal, { description: "A short story" }));
    await assertFails(updateDoc(goal, { reward: "A different reward" }));
    await assertFails(updateDoc(goal, { rewardGivenAt: deleteField() }));
    const read = await assertSucceeds(getDoc(goal));
    assert.equal(read.get("rewardGivenAt").toMillis(), now.getTime());
});

test("a legacy goal history counts only work delivered before the goal was replaced", async () => {
    const spaceId = "legacy-goal-history";
    await provision(spaceId);
    const space = db.doc(`spaces/${spaceId}`);
    const endedAt = Date.now() - 60_000;
    const countFrom = endedAt - 180_000;
    const stored = { status: "archived", kind: "complete_assignments", targetCount: 1, updatedAt: new Date(endedAt) };
    const snapshot = (id: string, submittedAt: number) => ({ uid: "owner", spaceId, assignmentId: id, status: "submitted", submittedAt });
    const early = space.collection("lessons").doc("before");
    const late = space.collection("lessons").doc("after");
    await Promise.all([
        space.collection("goals").doc("earlier").set({
            ...stored, countFrom: new Date(countFrom), title: "Finished earlier",
            assignmentIds: ["before"], reward: "Choose a game to play together",
        }),
        space.collection("goals").doc("too-late").set({
            ...stored, title: "Replaced before delivery", assignmentIds: ["after"],
        }),
        space.collection("goals").doc("explicitly-closed").set({
            ...stored, title: "Closed unfinished", assignmentIds: ["before"], completedAt: null,
        }),
        space.collection("goals").doc("recorded").set({
            title: "Completed custom goal", status: "completed", kind: "custom", reward: "Go for a walk",
        }),
        early.set({ archived: true, archivedAt: new Date(endedAt + 1) }),
        late.set({ title: "Later assignment" }),
        early.collection("submissions").doc(`${spaceId}_before_owner`).set(snapshot("before", endedAt - 1)),
        late.collection("submissions").doc(`${spaceId}_after_owner`).set(snapshot("after", endedAt + 1)),
    ]);
    const cookie = sessionCookie(await redeem(spaceId, await invite(spaceId)), spaceId);
    const response = await room.GET(request({ cookie }), context(spaceId));
    assert.equal(response.status, 200);
    const home = await response.json();
    assert.deepEqual(home.goals.map(({ id }: { id: string }) => id).sort(), ["earlier", "recorded"]);
    assert.equal(home.goals[0].data.status, "completed");
    assert.equal(home.goals[0].data.reward, "Choose a game to play together");
    const marked = await goals.PATCH(request({
        bearer: "owner", method: "PATCH", body: { goalId: "earlier" },
    }), context(spaceId));
    assert.equal(marked.status, 200);
    assert.equal((await space.collection("goals").doc("earlier").get()).get("status"), "completed");
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
