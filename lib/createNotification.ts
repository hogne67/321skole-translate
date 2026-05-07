// lib/createNotification.ts
import { FieldValue, getFirestore } from "firebase-admin/firestore";

export type NotificationType =
    | "teacher_feedback"
    | "new_assignment"
    | "system"
    | "product_update";

type CreateNotificationInput = {
    uid: string;
    type: NotificationType;
    title: string;
    body: string;
    link?: string | null;
};

export async function createNotification(input: CreateNotificationInput) {
    const db = getFirestore();

    await db
        .collection("users")
        .doc(input.uid)
        .collection("notifications")
        .add({
            type: input.type,
            title: input.title,
            body: input.body,
            link: input.link || null,
            read: false,
            createdAt: FieldValue.serverTimestamp(),
        });
}