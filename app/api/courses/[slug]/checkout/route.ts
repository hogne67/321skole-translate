import "server-only";

import { NextRequest, NextResponse } from "next/server";
import { getAdmin } from "@/lib/firebaseAdmin";
import { getStripe } from "@/lib/stripe";
import {
  calculateCoursePayout,
  calculateCoursePayoutReleasePolicy,
} from "@/lib/courses/commerce";
import { normalizeCourse, normalizeCourseSalesSettings } from "@/lib/courses/types";

export const runtime = "nodejs";

function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status });
}

function readBearerToken(req: NextRequest): string | null {
  const h = req.headers.get("authorization") || req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

function requestOrigin(req: NextRequest): string {
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  if (host) {
    const proto = req.headers.get("x-forwarded-proto") || "https";
    return `${proto}://${host}`;
  }

  return process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
}

function requestLocale(req: NextRequest): string {
  const referer = req.headers.get("referer");
  if (referer) {
    try {
      const url = new URL(referer);
      const first = url.pathname.split("/").filter(Boolean)[0];
      if (first === "nb" || first === "en" || first === "pt") return first;
    } catch {
      // Fall through to query/fallback below.
    }
  }

  const locale = req.nextUrl.searchParams.get("locale");
  if (locale === "nb" || locale === "en" || locale === "pt") return locale;
  return "nb";
}

function isActiveBillingStatus(status: unknown): boolean {
  return status === "active" || status === "trialing";
}

function roleFromProfile(profile: Record<string, unknown>): string {
  if (typeof profile.role === "string") return profile.role;
  const roles = profile.roles && typeof profile.roles === "object" ? profile.roles as Record<string, unknown> : {};
  if (roles.teacher === true) return "teacher";
  if (roles.parent === true) return "parent";
  if (roles.student === true) return "student";
  return "";
}

function connectAccountId(profile: Record<string, unknown>): string {
  const connect =
    profile.academyStripeConnect && typeof profile.academyStripeConnect === "object"
      ? profile.academyStripeConnect as Record<string, unknown>
      : null;

  return typeof connect?.accountId === "string" ? connect.accountId : "";
}

function connectReady(profile: Record<string, unknown>): boolean {
  const connect =
    profile.academyStripeConnect && typeof profile.academyStripeConnect === "object"
      ? profile.academyStripeConnect as Record<string, unknown>
      : null;

  return (
    typeof connect?.accountId === "string" &&
    connect.chargesEnabled === true &&
    connect.payoutsEnabled === true &&
    connect.detailsSubmitted === true
  );
}

function participantCountsTowardCapacity(data: FirebaseFirestore.DocumentData): boolean {
  const status = typeof data.status === "string" ? data.status : "";
  return status === "invited" || status === "enrolled" || status === "active";
}

function participantMatchesBuyer(data: FirebaseFirestore.DocumentData, uid: string, email: string): boolean {
  const participantUid = typeof data.participantUid === "string" ? data.participantUid : "";
  const participantEmail = typeof data.email === "string" ? data.email.trim().toLowerCase() : "";
  return participantUid === uid || (!!email && participantEmail === email.toLowerCase());
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const token = readBearerToken(req);
    if (!token) return json({ error: "Sign in before buying a course" }, 401);

    const { slug } = await ctx.params;
    if (!slug) return json({ error: "Missing course slug" }, 400);

    const { auth, db } = getAdmin();
    const decoded = await auth.verifyIdToken(token);
    const uid = decoded.uid;

    const [buyerSnap, authUser, courseQuery] = await Promise.all([
      db.collection("users").doc(uid).get(),
      auth.getUser(uid),
      db.collection("courses").where("slug", "==", slug).limit(1).get(),
    ]);

    const courseDoc = courseQuery.docs[0];
    if (!courseDoc) return json({ error: "Course not found" }, 404);

    const courseData = courseDoc.data();
    if (courseData.status !== "published" && courseData.status !== "active") {
      return json({ error: "Course is not available for sale" }, 403);
    }

    const course = normalizeCourse(courseDoc.id, courseData as Record<string, unknown>);
    const sales = normalizeCourseSalesSettings(courseData.sales);
    if (sales.saleStatus !== "ready" || sales.priceAmountOre <= 0) {
      return json({ error: "Course checkout is not enabled yet" }, 403);
    }
    if (sales.taxProfile.deliveryType !== "live_instruction" || sales.taxProfile.vatTreatment !== "vat_exempt_education") {
      return json({ error: "Course needs tax review before checkout" }, 403);
    }

    const ownerSnap = await db.collection("users").doc(course.ownerUid).get();
    const owner = ownerSnap.exists ? ownerSnap.data() ?? {} : {};
    if (!connectReady(owner)) return json({ error: "Instructor has not connected Stripe yet" }, 403);

    const buyerEmail = authUser.email ?? "";
    const participantsSnap = await courseDoc.ref.collection("participants").get();
    const alreadyParticipant = participantsSnap.docs.some((doc) =>
      participantMatchesBuyer(doc.data(), uid, buyerEmail)
    );
    if (alreadyParticipant) {
      return json(
        {
          error: "You are already enrolled in this course",
          alreadyEnrolled: true,
          courseId: course.id,
        },
        409
      );
    }

    const capacityCount = participantsSnap.docs.filter((doc) =>
      participantCountsTowardCapacity(doc.data())
    ).length;
    if (course.maxParticipants > 0 && capacityCount >= course.maxParticipants) {
      return json({ error: "This course is full", courseFull: true }, 409);
    }

    const buyer = buyerSnap.exists ? buyerSnap.data() ?? {} : {};
    const billing =
      buyer.billing && typeof buyer.billing === "object"
        ? buyer.billing as Record<string, unknown>
        : null;
    const participantHasActiveLicense = isActiveBillingStatus(billing?.status);
    const payout = calculateCoursePayout({
      grossAmountOre: sales.priceAmountOre,
      numberOfSessions: course.numberOfSessions,
      numberOfWeeks: course.numberOfWeeks,
      participantHasActiveLicense,
    });
    const payoutRelease = calculateCoursePayoutReleasePolicy(payout.instructorAmountOre);
    const instructorConnectAccountId = connectAccountId(owner);

    const now = new Date();
    const orderRef = db.collection("courseOrders").doc();
    await orderRef.set({
      courseId: course.id,
      courseSlug: course.slug,
      courseTitle: course.title,
      ownerUid: course.ownerUid,
      buyerUid: uid,
      buyerEmail,
      buyerRole: roleFromProfile(buyer),
      status: "checkout_created",
      currency: sales.currency,
      taxProfile: sales.taxProfile,
      participantHasActiveLicense,
      payout,
      payoutRelease,
      payoutStatus: "held",
      payoutTransferMode: "platform_hold",
      instructorConnectAccountId,
      createdAt: now,
      updatedAt: now,
    });

    const origin = requestOrigin(req);
    const locale = requestLocale(req);
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      customer_email: authUser.email ?? undefined,
      line_items: [
        {
          price_data: {
            currency: sales.currency.toLowerCase(),
            unit_amount: sales.priceAmountOre,
            product_data: {
              name: course.title,
              description: course.marketing.summary || course.description || undefined,
              images: course.marketing.coverImageUrl ? [course.marketing.coverImageUrl] : undefined,
            },
          },
          quantity: 1,
        },
      ],
      payment_intent_data: {
        metadata: {
          product: "321AcademyCourse",
          orderId: orderRef.id,
          courseId: course.id,
          uid,
        },
      },
      metadata: {
        product: "321AcademyCourse",
        orderId: orderRef.id,
        courseId: course.id,
        uid,
      },
      success_url: `${origin}/${locale}/academy/courses?courseCheckout=success&order=${orderRef.id}`,
      cancel_url: `${origin}/${locale}/courses/${course.slug}?courseCheckout=cancel`,
    });

    await orderRef.set(
      {
        stripeCheckoutSessionId: session.id,
        updatedAt: new Date(),
      },
      { merge: true }
    );

    return json({ url: session.url, orderId: orderRef.id }, 200);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start course checkout";
    return json({ error: message }, 500);
  }
}
