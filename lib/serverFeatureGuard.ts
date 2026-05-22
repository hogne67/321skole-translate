import { FieldValue, type Firestore } from "firebase-admin/firestore";
import {
    getFeatureDecisionFromProfile,
    getQuotaBucket,
    type BillingSnapshot,
    type FeatureKey,
    type PartnerAccessSnapshot,
    type SchoolAccessSnapshot,
} from "@/lib/featureAccess";

type ServerFeatureParams = {
    db: Firestore;
    uid: string;
    role?: string | null;
    plan?: string | null;
    billing?: BillingSnapshot | null;
} & PartnerAccessSnapshot & SchoolAccessSnapshot & {
    feature: FeatureKey;
};

function getMonthId(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

async function getServerUsage(db: Firestore, uid: string) {
    const ref = db.collection("users").doc(uid).collection("usage").doc(getMonthId());
    const snap = await ref.get();

    if (!snap.exists) return {};

    return snap.data() as Record<string, number>;
}

export async function getServerFeatureStatusFromProfile(
    params: ServerFeatureParams
) {
    const {
        db,
        uid,
        role,
        plan,
        billing,
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
        feature,
    } = params;

    const decision = getFeatureDecisionFromProfile({
        role,
        plan,
        billing,
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
        feature,
    });

    const bucket = getQuotaBucket(feature);

    if (!decision.allowed || decision.limit <= 0) {
        return {
            allowed: false,
            used: 0,
            limit: 0,
            remaining: 0,
            bucket,
            reason: decision.reason ?? "not_allowed",
        };
    }

    const usage = await getServerUsage(db, uid);
    const rawUsed = usage[bucket];
    const used = typeof rawUsed === "number" && Number.isFinite(rawUsed) ? rawUsed : 0;
    const remaining = Math.max(0, decision.limit - used);

    return {
        allowed: remaining > 0,
        used,
        limit: decision.limit,
        remaining,
        bucket,
        reason: remaining > 0 ? undefined : "limit_reached",
    };
}

export async function consumeServerFeature(params: {
    db: Firestore;
    uid: string;
    feature: FeatureKey;
    amount?: number;
}) {
    const { db, uid, feature, amount = 1 } = params;
    const bucket = getQuotaBucket(feature);

    const ref = db.collection("users").doc(uid).collection("usage").doc(getMonthId());

    await ref.set(
        {
            [bucket]: FieldValue.increment(amount),
            updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true }
    );
}
