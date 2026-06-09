import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
    costForFeature,
    getBucketLimit,
    getEffectivePlan,
    getQuotaBucket,
    type AppRole,
    type BillingSnapshot,
    type FeatureKey,
    type PlanKey,
    type QuotaBucket,
} from "@/lib/featureAccess";
import type FirebaseFirestore from "firebase-admin/firestore";
import { FieldValue } from "firebase-admin/firestore";

function json(data: unknown, status = 200) {
    return NextResponse.json(data, { status });
}

function getBearerToken(req: Request): string | null {
    const h = req.headers.get("authorization") || req.headers.get("Authorization");
    const m = h?.match(/^Bearer\s+(.+)$/i);
    return m ? m[1] : null;
}

function getMonthId(date = new Date()): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, "0");
    return `${y}-${m}`;
}

const FEATURE_KEYS: FeatureKey[] = [
    "producer_create_lesson",
    "producer_create_reading_test",
    "producer_create_quiz",
    "producer_create_writing_task",
    "producer_create_math_worksheet",
    "teacher_assign_task",
    "ai_feedback",
    "ai_generate_text",
    "ai_generate_reading_test",
    "ai_image_generate",
    "image_download",
    "pdf_download",
    "space_members",
    "premium_app_access",
];

function isFeatureKey(v: unknown): v is FeatureKey {
    return typeof v === "string" && FEATURE_KEYS.includes(v as FeatureKey);
}

function readString(v: unknown, fallback = ""): string {
    return typeof v === "string" ? v.trim() : fallback;
}

function isRecord(v: unknown): v is Record<string, unknown> {
    return typeof v === "object" && v !== null;
}

function isAppRole(v: unknown): v is AppRole {
    return (
        v === "teacher" ||
        v === "student" ||
        v === "parent" ||
        v === "creator" ||
        v === "admin" ||
        v === "anonymous"
    );
}

function isPlanKey(v: unknown): v is PlanKey {
    return v === "free" || v === "basic" || v === "plus" || v === "pro";
}

function pickRoleFromRolesObject(roles: unknown): AppRole | null {
    if (!isRecord(roles)) return null;

    if (roles.admin === true) return "admin";
    if (roles.teacher === true) return "teacher";
    if (roles.creator === true) return "creator";
    if (roles.parent === true) return "parent";
    if (roles.student === true) return "student";

    return null;
}

function readBillingSnapshot(value: unknown): BillingSnapshot | null {
    if (!isRecord(value)) return null;

    return {
        plan: typeof value.plan === "string" ? value.plan : null,
        status: typeof value.status === "string" ? value.status : null,
    };
}

async function resolveRoleAndPlan(params: {
    firestore: FirebaseFirestore.Firestore;
    uid: string;
    decoded: Record<string, unknown>;
}): Promise<{ role: AppRole; plan: PlanKey }> {
    const { firestore, uid, decoded } = params;

    let role: AppRole = "anonymous";
    let topLevelPlan: PlanKey = "free";
    let billing = readBillingSnapshot(decoded.billing);
    let partnerAccess = decoded.partnerAccess === true;
    let partnerStatus = readString(decoded.partnerStatus);
    let schoolId = readString(decoded.schoolId);
    let schoolRole = readString(decoded.schoolRole);
    let schoolStatus = readString(decoded.schoolStatus);

    if (isAppRole(decoded.role)) {
        role = decoded.role;
    } else if (isAppRole(decoded.mode)) {
        role = decoded.mode;
    } else {
        const roleFromClaims = pickRoleFromRolesObject(decoded.roles);
        if (roleFromClaims) role = roleFromClaims;
    }

    if (isPlanKey(decoded.plan)) {
        topLevelPlan = decoded.plan;
    }

    const userSnap = await firestore.collection("users").doc(uid).get();
    if (userSnap.exists) {
        const userData = (userSnap.data() ?? {}) as Record<string, unknown>;

        if (isAppRole(userData.role)) {
            role = userData.role;
        } else if (isAppRole(userData.mode)) {
            role = userData.mode;
        } else {
            const roleFromProfile = pickRoleFromRolesObject(userData.roles);
            if (roleFromProfile) role = roleFromProfile;
        }

        if (isPlanKey(userData.plan)) {
            topLevelPlan = userData.plan;
        }

        const userBilling = readBillingSnapshot(userData.billing);
        if (userBilling) billing = userBilling;

        partnerAccess = userData.partnerAccess === true;
        partnerStatus = readString(userData.partnerStatus);
        schoolId = readString(userData.schoolId);
        schoolRole = readString(userData.schoolRole);
        schoolStatus = readString(userData.schoolStatus);
    }

    const plan = getEffectivePlan({
        plan: topLevelPlan,
        billing,
        partnerAccess,
        partnerStatus,
        schoolId,
        schoolRole,
        schoolStatus,
    });

    return { role, plan };
}

export async function POST(req: Request) {
    try {
        const token = getBearerToken(req);

        if (!token) {
            return json({ error: "Missing Authorization bearer token" }, 401);
        }

        const admin = getAdmin();

        const auth = admin.auth;
        const firestore = admin.db;

        const decoded = await auth.verifyIdToken(token);
        const uid = decoded.uid;
        const decodedRecord = decoded as Record<string, unknown>;

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

        if (!isFeatureKey(body.feature)) {
            return json({ error: "Invalid feature" }, 400);
        }

        const feature = body.feature;
        const bucket = getQuotaBucket(feature);
        const amount = costForFeature(feature);
        const monthId = getMonthId();
        const { role, plan } = await resolveRoleAndPlan({
            firestore,
            uid,
            decoded: decodedRecord,
        });
        const limit = getBucketLimit(role, plan, bucket as QuotaBucket);

        const contentId = readString(body.contentId);
        const contentType = readString(body.contentType, "unknown");
        const source = readString(body.source, "unknown");
        const path = readString(body.path);

        const usageRef = firestore
            .collection("users")
            .doc(uid)
            .collection("usage")
            .doc(monthId);

        const eventRef = firestore.collection("usageEvents").doc();

        const result = await firestore.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
            const usageSnap = await tx.get(usageRef);
            const usageData = (usageSnap.exists ? usageSnap.data() : {}) as Partial<
                Record<QuotaBucket, number>
            >;
            const usedBefore =
                typeof usageData[bucket] === "number" && Number.isFinite(usageData[bucket])
                    ? usageData[bucket]
                    : 0;
            const usedAfter = usedBefore + amount;

            if (usedAfter > limit) {
                return {
                    ok: false as const,
                    used: usedBefore,
                    remaining: Math.max(0, limit - usedBefore),
                };
            }

            tx.set(
                usageRef,
                {
                    [bucket]: FieldValue.increment(amount),
                    updatedAt: FieldValue.serverTimestamp(),
                },
                { merge: true }
            );

            tx.set(eventRef, {
                uid,
                feature,
                bucket,
                amount,
                contentId,
                contentType,
                source,
                path,
                monthId,
                createdAt: FieldValue.serverTimestamp(),
            });

            return {
                ok: true as const,
                used: usedAfter,
                remaining: Math.max(0, limit - usedAfter),
            };
        });

        if (!result.ok) {
            return json(
                {
                    error: "Limit reached",
                    feature,
                    bucket,
                    role,
                    plan,
                    limit,
                    used: result.used,
                    remaining: result.remaining,
                    monthId,
                },
                429
            );
        }

        return json({
            ok: true,
            feature,
            bucket,
            amount,
            role,
            plan,
            limit,
            used: result.used,
            remaining: result.remaining,
            monthId,
        });
    } catch (e: unknown) {
        return json(
            {
                error: "Usage logging failed",
                details: e instanceof Error ? e.message : String(e),
            },
            500
        );
    }
}
