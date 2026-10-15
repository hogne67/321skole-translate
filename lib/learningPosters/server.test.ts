import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { type Firestore } from "firebase-admin/firestore";
import { getFeatureDecisionFromProfile, getQuotaBucket } from "../featureAccess";
import type { getAdmin } from "../firebaseAdmin";
import { normalizePlan, normalizePosterSettings, posterLanguageName, sourceWarnings, posterGoalPrompt, posterSuggestionPrompt, type PosterPlan } from "./model";
import { digest, readSource, ownedPoster, savePoster, suggestPoster, generatePosterImages, withPosterQuota, posterAccount, type PosterAccount } from "./server";
import { renderPosterSvg } from "./render";
import { renderPosterPng } from "./render.server";

const plan: PosterPlan = { title: "Vi drikker", goal: "Lese setninger om drikke.", focus: "drikker", level: "A1", language: "nb", kind: "patterns", purpose: "during",
  items: ["vann", "melk", "te"].map(word => ({ label: word, caption: `Jeg drikker ${word}.`, explanation: "", quote: `Jeg drikker ${word}.`, visualPrompt: `An adult drinking ${word}.` })) };
function firestoreValue<T>(value: T): T {
  if (Array.isArray(value)) return value.map(firestoreValue) as T;
  if (value && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([key, item]) => [key, firestoreValue(item)])) as T;
  }
  return value;
}
function fixture() {
  const records = new Map<string, Record<string, unknown>>(); let queue = Promise.resolve();
  const snapshot = (path: string) => ({ data: () => records.get(path), get: (key: string) => records.get(path)?.[key] });
  // Firestore sorts map keys when persisting documents, including nested maps.
  const set = (path: string, data: Record<string, unknown>) => { records.set(path, firestoreValue({ ...records.get(path), ...data })); };
  const doc = (path: string) => ({ path, id: path.split("/").at(-1), get: async () => snapshot(path), set: async (data: Record<string, unknown>) => set(path, data) });
  const db = { doc, collection: (name: string) => ({ doc: (id: string) => doc(`${name}/${id}`) }),
    runTransaction: <T>(fn: (tx: unknown) => Promise<T>) => {
      const run = queue.then(async () => {
        const writes: (() => void)[] = [];
        const result = await fn({ get: async (ref: { path: string }) => snapshot(ref.path),
          set: (ref: { path: string }, data: Record<string, unknown>) => writes.push(() => set(ref.path, data)),
          update: (ref: { path: string }, data: Record<string, unknown>) => writes.push(() => set(ref.path, data)) });
        writes.forEach(write => write()); return result;
      });
      queue = run.then(() => undefined, () => undefined); return run;
    },
  } as unknown as Firestore;
  const account = { db, uid: "fred", verified: true, profile: { role: "teacher", plan: "pro" } } as unknown as PosterAccount;
  records.set("lessons/own", { ownerId: "fred", title: "Drikke", sourceText: plan.items.map(i => i.quote).join("\n"), tasks: [{ answer: "secret-answer-never-send" }] });
  records.set("lessons/other", { ownerId: "admin", sourceText: "Private text" });
  const source = () => readSource(db, account.uid, { lessonId: "own" });
  const usage = () => records.get(`users/fred/usage/${new Date().toISOString().slice(0, 7)}`) || {};
  const images: { path: string; buffer: Buffer }[] = [];
  const deps = { createSheet: async () => sharp({ create: { width: 1536, height: 1024, channels: 3, background: "#93c5fd" } }).png().toBuffer(),
    saveImage: async (path: string, buffer: Buffer) => { images.push({ path, buffer }); return { path, url: `https://example.test/${path}` }; } };
  return { records, account, source, usage, images, deps };
}

test("Firebase connection failures are unavailable, not signed out; invalid sessions stay unauthorized", async () => {
  const f = fixture(); const req = new Request("http://localhost/api/producer/learning-posters", { headers: { Authorization: "Bearer fixture-token" } });
  const factory = (code: string) => () => ({ ...f.account, auth: { verifyIdToken: async () => {
    throw Object.assign(new Error("Firebase connection failure"), { code });
  } } }) as unknown as ReturnType<typeof getAdmin>;
  await assert.rejects(posterAccount(req, factory("auth/internal-error")), { reason: "authentication_unavailable", status: 503 });
  for (const code of ["auth/id-token-expired", "auth/id-token-revoked", "auth/argument-error", "auth/user-disabled"]) {
    await assert.rejects(posterAccount(req, factory(code)), { reason: "unauthorized", status: 401 });
  }
  await assert.rejects(posterAccount(new Request(req.url)), { reason: "unauthorized", status: 401 });
});

test("account identity comes from the verified token, with revocation checked", async () => {
  const f = fixture(); f.records.set("users/fred", f.account.profile);
  const req = new Request("http://localhost/api/producer/learning-posters?ownerId=admin", { headers: { Authorization: "Bearer fixture-token" } });
  const admin = { ...f.account, auth: { verifyIdToken: async (token: string, checkRevoked: boolean) => {
    assert.equal(token, "fixture-token"); assert.equal(checkRevoked, true);
    return { uid: "fred", email_verified: true, firebase: { sign_in_provider: "password" } };
  } } } as unknown as ReturnType<typeof getAdmin>;
  assert.equal((await posterAccount(req, () => admin)).uid, "fred");
  f.records.set("users/fred", { role: "student" });
  await assert.rejects(posterAccount(req, () => admin), { reason: "forbidden", status: 403 });
  f.records.set("users/fred", { role: "teacher", disabled: true });
  await assert.rejects(posterAccount(req, () => admin), { reason: "forbidden", status: 403 });
});

test("only own source lessons and posters can be read or overwritten; server supplies owner", async () => {
  const f = fixture();
  await assert.rejects(readSource(f.account.db, "fred", { lessonId: "other" }), /source_not_found/);
  await assert.rejects(readSource(f.account.db, "fred", { lessonId: "../own" }), /invalid_input/);
  const saved = await savePoster(f.account, { source: await f.source(), plan: { ...plan, ownerId: "admin" } });
  assert.equal(saved.ownerId, "fred");
  const stranger = { ...f.account, uid: "admin" };
  await assert.rejects(ownedPoster(stranger, saved.id), /poster_not_found/);
  await assert.rejects(savePoster(stranger, { id: saved.id, source: saved.source, plan }), /poster_not_found/);
  assert.equal((await ownedPoster(f.account, saved.id)).ownerId, "fred");
});

test("source excerpts are checked, and exercise answers are excluded from AI input", async () => {
  const f = fixture(); const source = await f.source();
  assert.deepEqual(sourceWarnings(plan, source.text.replaceAll(" ", "\n")), []);
  const wrong = { ...plan, items: [{ ...plan.items[0], quote: "I invented this." }] };
  await assert.rejects(savePoster(f.account, { source, plan: wrong }), /invalid_quote/);
  const prompt = posterSuggestionPrompt(source, plan);
  assert.ok(prompt.includes(source.text.replaceAll("\n", "\\n")));
  assert.ok(!prompt.includes("secret-answer-never-send"));
  assert.throws(() => normalizePlan({ ...plan, kind: "sounds", focus: "" }), /invalid_input/);
  assert.throws(() => normalizePlan({ ...plan, items: Array(7).fill(plan.items[0]) }), /invalid_input/);
});

test("chosen language applies to every authored field; AI can formulate an empty goal", () => {
  for (const code of ["nb", "no", "Norsk", "nb-NO", "Norsk (bokmål)"]) assert.equal(posterLanguageName(code), "Norwegian Bokmål (norsk bokmål)");
  assert.equal(posterLanguageName("nn"), "Norwegian Nynorsk (norsk nynorsk)");
  assert.equal(posterLanguageName("en"), "English");
  const settings = normalizePosterSettings({ ...plan, goal: "" });
  assert.equal(settings.goal, "");
  assert.throws(() => normalizePlan({ ...plan, goal: "" }), /invalid_input/);
  const prompt = posterSuggestionPrompt({ lessonId: null, title: "Drikke", text: "Jeg drikker vann.", hash: "" }, settings);
  assert.ok(prompt.includes("OUTPUT LANGUAGE: Norwegian Bokmål (norsk bokmål)"));
  assert.ok(prompt.includes("title, goal, label, caption, explanation AND visualPrompt"));
  assert.ok(!prompt.includes("Support understanding of the source text"));
});

test("goal suggestions use the selected text and settings; card instructions prioritise the teacher's goal", () => {
  const source = { lessonId: null, title: "På lekeplassen", text: "Jesper leker. Helle drikker kaffe. De spiser eple og brødskiver før de går hjem.", hash: "" };
  const food = { ...plan, goal: "Lære ord om mat." };
  const retelling = { ...plan, goal: "Gjenfortelle besøket på lekeplassen." };
  const foodPrompt = posterSuggestionPrompt(source, food);
  const retellingPrompt = posterSuggestionPrompt(source, retelling);
  assert.ok(foodPrompt.includes(food.goal)); assert.ok(retellingPrompt.includes(retelling.goal));
  assert.notEqual(foodPrompt, retellingPrompt);
  assert.ok(retellingPrompt.includes("PRIMARY criterion"));
  assert.ok(retellingPrompt.includes("main actions and their sequence"));
  const goalPrompt = posterGoalPrompt(source, normalizePosterSettings({ ...retelling, goal: "" }));
  assert.ok(goalPrompt.includes(source.text)); assert.ok(goalPrompt.includes("Norwegian Bokmål"));
  assert.ok(goalPrompt.includes("ONE short, concrete learning goal"));
});

test("explanations are optional by default, and existing posters retain their explanation text", () => {
  const item = { ...plan.items[0], explanation: "En kort forklaring." };
  const settings = normalizePosterSettings(plan);
  assert.equal(settings.includeExplanations, false);
  assert.equal(normalizePlan({ ...plan, items: [item] }).items[0].explanation, item.explanation);
  assert.equal(normalizePlan({ ...plan, includeExplanations: true, items: [item] }).items[0].explanation, item.explanation);
  assert.equal(normalizePlan({ ...plan, includeExplanations: false, items: [item] }).items[0].explanation, "");
  assert.ok(posterSuggestionPrompt({ lessonId: null, title: "Drikke", text: "Jeg drikker vann.", hash: "" }, settings).includes("Leave every explanation empty"));
  assert.throws(() => normalizePosterSettings({ ...plan, includeExplanations: "yes" }), /invalid_input/);
});

test("teacher wishes guide a generated student goal instead of overwriting it; six cards use one text generation", async () => {
  const f = fixture();
  const wishes = "Viktige ord som radikal, radikalisering, vold, ekstremisme osv.";
  const goal = "Forstå og bruke sentrale begreper om radikalisering og ekstremisme.";
  let calls = 0;
  const result = await suggestPoster(f.account, await f.source(), { ...plan, goal: wishes }, async prompt => {
    calls++;
    assert.ok(prompt.includes(wishes));
    assert.ok(prompt.includes("never copy a fragment, word list or teacher instruction verbatim"));
    assert.ok(prompt.includes("Default to exactly 6"));
    return { title: plan.title, goal, items: Array.from({ length: 6 }, (_, index) => ({ ...plan.items[index % 3] })) };
  });
  assert.equal(result.goal, goal); assert.notEqual(result.goal, wishes);
  assert.equal(result.items.length, 6); assert.equal(calls, 1);
  assert.equal(f.usage()[getQuotaBucket("ai_generate_text")], 1);
  const saved = await savePoster(f.account, { source: await f.source(), plan: result, approved: true });
  assert.equal((await ownedPoster(f.account, saved.id)).plan.goal, goal);
});

test("downloaded PNG embeds the actual logo at the top, including the illustration-only version", async () => {
  for (const hidden of [false, true]) {
    const png = await renderPosterPng(plan, [], hidden);
    const withLogo = await sharp(png).extract({ left: 1670, top: 15, width: 54, height: 49 }).raw().toBuffer();
    const withoutLogo = await sharp(Buffer.from(renderPosterSvg(plan, [], hidden))).extract({ left: 1670, top: 15, width: 54, height: 49 }).raw().toBuffer();
    assert.notDeepEqual(withLogo, withoutLogo);
    const metadata = await sharp(png).metadata();
    assert.equal(metadata.width, 1920); assert.equal(metadata.height, 1440);
  }
});

test("approval survives persisted map ordering and reopening, but actual edits require review", async () => {
  const f = fixture();
  const saved = await savePoster(f.account, { source: await f.source(), plan, approved: true });
  const reopened = await ownedPoster(f.account, saved.id);
  assert.notDeepEqual(Object.keys(saved.plan), Object.keys(reopened.plan));
  assert.equal(reopened.reviewedHash, digest(reopened.plan));
  const roundTrip = await savePoster(f.account, { ...reopened, approved: true });
  const result = await generatePosterImages(f.account, roundTrip.id, f.deps);
  assert.equal(result.images.length, 3);
  assert.equal(f.usage().image_generation, 1);
  const ref = f.records.get(`learningPosters/${saved.id}`)!;
  f.records.set(`learningPosters/${saved.id}`, { ...ref, plan: { ...plan, goal: "Endret innhold uten ny godkjenning." } });
  await assert.rejects(generatePosterImages(f.account, saved.id, f.deps), /review_required/);
  assert.equal(f.usage().image_generation, 1);
  assert.notEqual(digest(plan), digest({ ...plan, items: [...plan.items].reverse() }));
});

test("review gate precedes paid image work; one sheet produces independent 512px illustrations", async () => {
  const f = fixture(); const saved = await savePoster(f.account, { source: await f.source(), plan });
  await assert.rejects(generatePosterImages(f.account, saved.id, f.deps), /review_required/);
  assert.equal(f.images.length, 0);
  await savePoster(f.account, { ...saved, approved: true });
  const result = await generatePosterImages(f.account, saved.id, f.deps);
  assert.equal(result.images.length, 3); assert.equal(f.usage().image_generation, 1);
  for (const image of f.images) {
    assert.ok(image.path.startsWith(`learning-posters/fred/${saved.id}/`));
    const metadata = await sharp(image.buffer).metadata();
    assert.equal(metadata.width, 512); assert.equal(metadata.height, 512); assert.equal(metadata.format, "webp");
  }
  const changedCaption = await savePoster(f.account, { ...result, plan: { ...plan, goal: "Et nytt læringsmål." } });
  assert.equal(changedCaption.images.length, 3); assert.equal(changedCaption.reviewedHash, null);
  await assert.rejects(generatePosterImages(f.account, saved.id, f.deps), /review_required/);
  const changedVisual = await savePoster(f.account, { ...result, plan: { ...plan, items: plan.items.map(i => ({ ...i, visualPrompt: "New scene" })) } });
  assert.deepEqual(changedVisual.images, []);
});

test("changed lesson prevents generation; edits during generation cannot overwrite the newer plan", async () => {
  for (const change of ["source-before", "source-during", "poster-during", "manual-source-during"] as const) {
    const f = fixture(); const saved = await savePoster(f.account, { source: await f.source(), plan, approved: true });
    const changeSource = () => f.records.set("lessons/own", { ownerId: "fred", sourceText: "Ny tekst." });
    if (change === "source-before") changeSource();
    const deps = { ...f.deps, createSheet: async () => {
      if (change === "source-during") changeSource();
      if (change === "poster-during") await savePoster(f.account, { ...saved, plan: { ...plan, title: "Ny plakat" }, approved: true });
      if (change === "manual-source-during") await savePoster(f.account, { ...saved, source: await readSource(f.account.db, "fred", { text: saved.source.text + " Ny setning." }), approved: true });
      return f.deps.createSheet();
    } };
    await assert.rejects(generatePosterImages(f.account, saved.id, deps), change.endsWith("poster-during") || change === "manual-source-during" ? /poster_changed/ : /source_changed/);
    assert.equal(f.usage().image_generation || 0, 0);
    assert.deepEqual((await ownedPoster(f.account, saved.id)).images, []);
    assert.ok(!f.records.get(`learningPosters/${saved.id}`)?.imageStartedAt);
    if (change === "poster-during") assert.equal((await ownedPoster(f.account, saved.id)).plan.title, "Ny plakat");
  }
});

test("duplicate generation is rejected before a second image call or quota charge", async () => {
  const f = fixture(); const saved = await savePoster(f.account, { source: await f.source(), plan, approved: true });
  let calls = 0;
  let release!: () => void; const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void; const started = new Promise<void>(resolve => { entered = resolve; });
  const deps = { ...f.deps, createSheet: async () => { calls++; entered(); await gate; return f.deps.createSheet(); } };
  const first = generatePosterImages(f.account, saved.id, deps); await started;
  await assert.rejects(generatePosterImages(f.account, saved.id, deps), /generation_busy/);
  release(); await first;
  assert.equal(calls, 1); assert.equal(f.usage().image_generation, 1);
});

test("quota reservation is atomic, failed work is refunded, and unverified accounts cannot generate", async () => {
  const f = fixture(); const feature = "ai_image_generate"; const bucket = getQuotaBucket(feature);
  const limit = getFeatureDecisionFromProfile({ ...f.account.profile, feature }).limit;
  f.records.set(`users/fred/usage/${new Date().toISOString().slice(0, 7)}`, { [bucket]: limit - 1 });
  let calls = 0;
  const results = await Promise.allSettled([1, 2].map(() => withPosterQuota(f.account, feature, async () => { calls++; return "ok"; })));
  assert.equal(calls, 1); assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
  assert.equal(f.usage()[bucket], limit);
  f.records.clear();
  await assert.rejects(withPosterQuota(f.account, feature, async () => { throw new Error("provider unavailable"); }), /provider unavailable/);
  assert.equal(f.usage()[bucket], 0);
  await assert.rejects(withPosterQuota({ ...f.account, verified: false }, feature, async () => { calls++; }), /email_verification_required/);
  assert.equal(calls, 1);
});

test("export escapes teacher text, highlights focus, and supports an illustration-only version", async () => {
  const hostile = { ...plan, items: [{ ...plan.items[0], label: "<script>alert(1)</script>", explanation: "En forklaring med æøå." }] };
  const svg = renderPosterSvg(hostile, []);
  assert.ok(svg.includes("A1 · Norsk bokmål"));
  assert.ok(renderPosterSvg({ ...hostile, level: "A1_START" }, [], false, "", "en").includes("A1 start · Norwegian Bokmål"));
  assert.ok(!svg.includes("<script>")); assert.ok(svg.includes("&lt;script&gt;"));
  assert.ok(svg.includes('fill="#0284c7" font-weight="700">drikker'));
  assert.ok(!renderPosterSvg(hostile, [], true).includes("alert(1)"));
  const metadata = await sharp(Buffer.from(svg)).png().metadata();
  assert.equal(metadata.width, 1920); assert.equal(metadata.height, 1440);
  const embedded = await sharp({ create: { width: 512, height: 512, channels: 3, background: "#ff0000" } }).png().toBuffer();
  const raster = await sharp(Buffer.from(renderPosterSvg(plan, [`data:image/png;base64,${embedded.toString("base64")}`]))).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  const pixel = (280 * raster.info.width + 340) * raster.info.channels;
  assert.equal(raster.data[pixel], 255); assert.equal(raster.data[pixel + 1], 0); assert.equal(raster.data[pixel + 2], 0);
  assert.notEqual(digest(plan), digest({ ...plan, title: "Changed" }));
});
