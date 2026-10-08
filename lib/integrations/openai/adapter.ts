import "server-only";
import { createHash } from "node:crypto";
import { Timestamp, type Firestore } from "firebase-admin/firestore";
import { errors, type Adapter, type AdapterFactory, type AdapterPayload } from "oidc-provider";

export const OAUTH_STATE_COLLECTION = "openaiOAuthState";
export const stateId = (model: string, id: string) => createHash("sha256").update(`${model}\0${id}`).digest("hex");

/** OAuth protocol artifacts only. Firebase remains the identity database. */
export function firestoreAdapter(db: Firestore): AdapterFactory {
  return (model) => {
    const collection = db.collection(OAUTH_STATE_COLLECTION);
    const ref = (id: string) => collection.doc(stateId(model, id));
    const decode = (data: FirebaseFirestore.DocumentData | undefined): AdapterPayload | undefined => {
      if (!data || (data.expiresAt && data.expiresAt.toMillis() <= Date.now())) return undefined;
      return JSON.parse(data.payload) as AdapterPayload;
    };
    const adapter: Adapter = {
      async upsert(id, payload, expiresIn) {
        // Preserve a consumption marker even if a stale instance saves the artifact.
        await db.runTransaction(async (tx) => {
          const record = ref(id);
          const existing = (await tx.get(record)).data();
          const consumed = existing?.consumed;
          tx.set(record, {
            model, payload: JSON.stringify({ ...payload, ...(consumed ? { consumed } : {}) }),
            consumed: consumed ?? payload.consumed ?? null,
            grantId: payload.grantId ?? null, uid: payload.uid ?? null, userCode: payload.userCode ?? null,
            expiresAt: typeof expiresIn === "number" ? Timestamp.fromMillis(Date.now() + Math.max(0, expiresIn) * 1000) : null,
          });
        });
      },
      async find(id) { return decode((await ref(id).get()).data()); },
      async findByUid(uid) {
        const snap = await collection.where("uid", "==", uid).get();
        return snap.docs.filter((doc) => doc.data().model === model).map((doc) => decode(doc.data())).find(Boolean);
      },
      async findByUserCode(code) {
        const snap = await collection.where("userCode", "==", code).get();
        return snap.docs.filter((doc) => doc.data().model === model).map((doc) => decode(doc.data())).find(Boolean);
      },
      async consume(id) {
        await db.runTransaction(async (tx) => {
          const record = ref(id);
          const data = (await tx.get(record)).data();
          const payload = decode(data);
          if (!payload || data?.consumed || payload.consumed) throw new errors.InvalidGrant("OAuth artifact already consumed or expired.");
          const consumed = Math.floor(Date.now() / 1000);
          tx.update(record, { consumed, payload: JSON.stringify({ ...payload, consumed }) });
        });
      },
      async destroy(id) { await ref(id).delete(); },
      async revokeByGrantId(grantId) {
        const snap = await collection.where("grantId", "==", grantId).get();
        for (let i = 0; i < snap.docs.length; i += 400) {
          const batch = db.batch();
          for (const doc of snap.docs.slice(i, i + 400)) batch.delete(doc.ref);
          await batch.commit();
        }
      },
    };
    return adapter;
  };
}
