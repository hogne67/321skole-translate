import "server-only";

import { NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import {
    costForFeature,
    getQuotaBucket,
    type FeatureKey,
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

        const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;

        if (!isFeatureKey(body.feature)) {
            return json({ error: "Invalid feature" }, 400);
        }

        const feature = body.feature;
        const bucket = getQuotaBucket(feature);
        const amount = costForFeature(feature);
        const monthId = getMonthId();

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

        await firestore.runTransaction(async (tx: FirebaseFirestore.Transaction) => {
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
        });

        return json({
            ok: true,
            feature,
            bucket,
            amount,
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