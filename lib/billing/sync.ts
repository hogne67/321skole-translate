// lib/billing/sync.ts
import Stripe from "stripe";
import { getAuth } from "firebase-admin/auth";
import { FieldValue, getFirestore } from "firebase-admin/firestore";
import { getAdminApp } from "@/lib/firebaseAdmin";
import {
  getBillingPlanByPriceId,
  normalizeStripeStatus,
  planFromBillingState,
  type BillingPlan,
  type BillingRole,
  type BillingStatus,
} from "@/lib/billing/config";

const USER_COLLECTION = "users";

type SyncBillingArgs = {
  uid: string;
  role: BillingRole;
  requestedPlan: BillingPlan;
  status: BillingStatus;
  customerId?: string | null;
  subscriptionId?: string | null;
  priceId?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd?: boolean;
};

function db() {
  return getFirestore(getAdminApp());
}

function auth() {
  return getAuth(getAdminApp());
}

function isoFromUnixSeconds(value?: number | null): string | null {
  if (!value || Number.isNaN(value)) return null;
  return new Date(value * 1000).toISOString();
}

function firstPriceIdFromSubscription(subscription: Stripe.Subscription): string | null {
  const item = subscription.items.data[0];
  return item?.price?.id ?? null;
}

function resolveBillingRoleFromUserData(data: Record<string, unknown>): BillingRole | null {
  const topRole = data.role;
  if (topRole === "student" || topRole === "teacher" || topRole === "parent") {
    return topRole;
  }

  const mode = data.mode;
  if (mode === "student" || mode === "teacher" || mode === "parent") {
    return mode;
  }

  const org = data.org;
  if (org && typeof org === "object") {
    const orgRole = (org as Record<string, unknown>).role;
    if (orgRole === "student" || orgRole === "teacher" || orgRole === "parent") {
      return orgRole;
    }
  }

  const roles = data.roles;
  if (roles && typeof roles === "object") {
    const roleMap = roles as Record<string, unknown>;
    if (roleMap.teacher === true) return "teacher";
    if (roleMap.parent === true) return "parent";
    if (roleMap.student === true) return "student";
  }

  return null;
}

async function findUidByCustomerId(customerId: string): Promise<string | null> {
  const snap = await db()
    .collection(USER_COLLECTION)
    .where("billing.customerId", "==", customerId)
    .limit(1)
    .get();

  if (snap.empty) return null;
  return snap.docs[0]?.id ?? null;
}

async function readUserData(uid: string): Promise<Record<string, unknown> | null> {
  const userSnap = await db().collection(USER_COLLECTION).doc(uid).get();
  if (!userSnap.exists) return null;

  const data = userSnap.data() as Record<string, unknown> | undefined;
  return data ?? null;
}

async function readUserRole(uid: string): Promise<BillingRole | null> {
  const data = await readUserData(uid);
  if (!data) return null;
  return resolveBillingRoleFromUserData(data);
}

function buildRolesPatch(role: BillingRole): Record<string, boolean> {
  return {
    teacher: role === "teacher",
    parent: role === "parent",
    student: role === "student",
  };
}

async function buildUserRolePatch(uid: string, role: BillingRole) {
  const existing = await readUserData(uid);

  const existingRoles =
    existing?.roles && typeof existing.roles === "object"
      ? (existing.roles as Record<string, unknown>)
      : {};

  return {
    role,
    roles: {
      ...existingRoles,
      ...buildRolesPatch(role),
    },
  };
}

export async function ensureStripeCustomerEmail(
  uid: string,
  customerId: string
): Promise<void> {
  const userRecord = await auth().getUser(uid).catch(() => null);
  const email = userRecord?.email ?? null;
  if (!email) return;

  await db()
    .collection(USER_COLLECTION)
    .doc(uid)
    .set(
      {
        billing: {
          customerId,
          email,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
}

export async function syncUserBilling(args: SyncBillingArgs): Promise<void> {
  const resolvedPlan = planFromBillingState({
    requestedPlan: args.requestedPlan,
    billingStatus: args.status,
  });

  const rolePatch = await buildUserRolePatch(args.uid, args.role);

  console.log("[billing sync] syncUserBilling", {
    uid: args.uid,
    role: args.role,
    requestedPlan: args.requestedPlan,
    resolvedPlan,
    status: args.status,
    customerId: args.customerId ?? null,
    subscriptionId: args.subscriptionId ?? null,
    priceId: args.priceId ?? null,
  });

  await db()
    .collection(USER_COLLECTION)
    .doc(args.uid)
    .set(
      {
        ...rolePatch,
        plan: resolvedPlan,
        billing: {
          provider: "stripe",
          roleProduct: args.role,
          plan: args.requestedPlan,
          status: args.status,
          customerId: args.customerId ?? null,
          subscriptionId: args.subscriptionId ?? null,
          priceId: args.priceId ?? null,
          currentPeriodEnd: args.currentPeriodEnd ?? null,
          cancelAtPeriodEnd: args.cancelAtPeriodEnd ?? false,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
}

export async function syncCanceledToFree(input: {
  uid: string;
  role?: BillingRole | null;
  customerId?: string | null;
  subscriptionId?: string | null;
}): Promise<void> {
  const role = input.role ?? (await readUserRole(input.uid)) ?? "teacher";
  const rolePatch = await buildUserRolePatch(input.uid, role);

  console.log("[billing sync] syncCanceledToFree", {
    uid: input.uid,
    role,
    customerId: input.customerId ?? null,
    subscriptionId: input.subscriptionId ?? null,
  });

  await db()
    .collection(USER_COLLECTION)
    .doc(input.uid)
    .set(
      {
        ...rolePatch,
        plan: "free",
        billing: {
          provider: "stripe",
          roleProduct: role,
          plan: "free",
          status: "canceled",
          customerId: input.customerId ?? null,
          subscriptionId: input.subscriptionId ?? null,
          priceId: null,
          currentPeriodEnd: null,
          cancelAtPeriodEnd: false,
          updatedAt: FieldValue.serverTimestamp(),
        },
      },
      { merge: true }
    );
}

export async function syncFromStripeSubscription(
  subscription: Stripe.Subscription,
  fallbackUid?: string | null
): Promise<void> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer?.id ?? null;

  const priceId = firstPriceIdFromSubscription(subscription);
  const priceConfig = priceId ? getBillingPlanByPriceId(priceId) : null;

  const uid =
    fallbackUid ??
    subscription.metadata?.uid ??
    (customerId ? await findUidByCustomerId(customerId) : null);

  if (!uid) {
    throw new Error("Could not resolve uid from Stripe subscription");
  }

  const role =
    (subscription.metadata?.role as BillingRole | undefined) ??
    priceConfig?.role ??
    (await readUserRole(uid));

  if (!role) {
    throw new Error(`Could not resolve role for uid ${uid}`);
  }

  const requestedPlan: BillingPlan =
    (subscription.metadata?.plan as BillingPlan | undefined) ??
    priceConfig?.plan ??
    "free";

  const currentPeriodEnd =
    "current_period_end" in subscription &&
    typeof (subscription as { current_period_end?: unknown }).current_period_end === "number"
      ? isoFromUnixSeconds(
          (subscription as { current_period_end?: number }).current_period_end
        )
      : null;

  console.log("[billing sync] syncFromStripeSubscription", {
    uid,
    subscriptionId: subscription.id,
    status: subscription.status,
    role,
    requestedPlan,
    priceId,
    customerId,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  });

  await syncUserBilling({
    uid,
    role,
    requestedPlan,
    status: normalizeStripeStatus(subscription.status),
    customerId,
    subscriptionId: subscription.id,
    priceId,
    currentPeriodEnd,
    cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
  });
}

export async function syncFromCheckoutSession(
  session: Stripe.Checkout.Session
): Promise<void> {
  const uid = session.metadata?.uid ?? null;
  const sessionRole = session.metadata?.role as BillingRole | undefined;
  const sessionPlan = session.metadata?.plan as BillingPlan | undefined;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : session.customer?.id ?? null;

  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : session.subscription?.id ?? null;

  if (!uid) {
    throw new Error("Missing checkout session metadata: uid");
  }

  const role = sessionRole ?? (await readUserRole(uid));
  if (!role) {
    throw new Error(`Could not resolve role for uid ${uid} from checkout session`);
  }

  const requestedPlan = sessionPlan ?? "free";

  console.log("[billing sync] syncFromCheckoutSession", {
    uid,
    role,
    requestedPlan,
    customerId,
    subscriptionId,
    paymentStatus: session.payment_status ?? null,
  });

  await syncUserBilling({
    uid,
    role,
    requestedPlan,
    status: "active",
    customerId,
    subscriptionId,
    priceId: null,
    currentPeriodEnd: null,
    cancelAtPeriodEnd: false,
  });
}