import type Stripe from "stripe";
import { getAdmin } from "@/lib/firebaseAdmin";

function safeString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isCourseCheckoutSession(session: Stripe.Checkout.Session): boolean {
  return session.metadata?.product === "321AcademyCourse";
}

export async function syncCourseOrderFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (!isCourseCheckoutSession(session)) return false;

  const orderId = safeString(session.metadata?.orderId);
  const courseId = safeString(session.metadata?.courseId);
  const uid = safeString(session.metadata?.uid);
  const email = safeString(session.customer_details?.email) || safeString(session.customer_email);
  const name = safeString(session.customer_details?.name) || email;

  if (!orderId || !courseId || !uid) {
    throw new Error("Missing course checkout metadata");
  }

  const { db } = getAdmin();
  const orderRef = db.collection("courseOrders").doc(orderId);
  const courseRef = db.collection("courses").doc(courseId);
  const participantRef = courseRef.collection("participants").doc(uid);
  const now = new Date();

  await db.runTransaction(async (tx) => {
    const [orderSnap, participantSnap] = await Promise.all([
      tx.get(orderRef),
      tx.get(participantRef),
    ]);
    const orderData = orderSnap.exists ? orderSnap.data() ?? {} : {};

    tx.set(
      orderRef,
      {
        status: session.payment_status === "paid" ? "paid" : "completed",
        stripeCheckoutSessionId: session.id,
        stripePaymentIntentId:
          typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? "",
        stripeCustomerId:
          typeof session.customer === "string" ? session.customer : session.customer?.id ?? "",
        paidAt: now,
        updatedAt: now,
      },
      { merge: true }
    );

    const participantBase = {
      participantUid: uid,
      roleSnapshot: safeString(orderData.buyerRole),
      name,
      email,
      phone: "",
      organization: "",
      note: "Created from paid course checkout.",
      status: "enrolled",
      updatedAt: now,
      source: "stripeCheckout",
      orderId,
    };

    if (participantSnap.exists) {
      tx.set(participantRef, participantBase, { merge: true });
    } else {
      tx.set(participantRef, {
        ...participantBase,
        createdAt: now,
      });
    }
  });

  return true;
}

export async function markCourseOrderFailedFromCheckoutSession(session: Stripe.Checkout.Session) {
  if (!isCourseCheckoutSession(session)) return false;

  const orderId = safeString(session.metadata?.orderId);
  if (!orderId) return false;

  const { db } = getAdmin();
  await db.collection("courseOrders").doc(orderId).set(
    {
      status: "failed",
      stripeCheckoutSessionId: session.id,
      updatedAt: new Date(),
    },
    { merge: true }
  );

  return true;
}
