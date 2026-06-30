// app/api/stripe/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { getStripe } from "@/lib/stripe";
import {
  syncCanceledToFree,
  syncFromCheckoutSession,
  syncFromStripeSubscription,
} from "@/lib/billing/sync";
import {
  markCourseOrderFailedFromCheckoutSession,
  syncCourseOrderFromCheckoutSession,
} from "@/lib/courses/orders";

export const runtime = "nodejs";

function getWebhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return secret;
}

function getCustomerId(
  customer: string | Stripe.Customer | Stripe.DeletedCustomer | null | undefined
): string | null {
  if (!customer) return null;
  return typeof customer === "string" ? customer : customer.id ?? null;
}

function getInvoiceSubscriptionId(invoice: unknown): string | null {
  if (!invoice || typeof invoice !== "object") return null;

  const record = invoice as { subscription?: unknown };
  const rawSubscription = record.subscription;

  if (typeof rawSubscription === "string") {
    return rawSubscription;
  }

  if (
    rawSubscription &&
    typeof rawSubscription === "object" &&
    "id" in rawSubscription &&
    typeof (rawSubscription as { id?: unknown }).id === "string"
  ) {
    return (rawSubscription as { id: string }).id;
  }

  return null;
}

async function syncSubscriptionById(
  stripe: Stripe,
  subscriptionId: string | null,
  fallbackUid?: string | null
) {
  if (!subscriptionId) return;

  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  await syncFromStripeSubscription(subscription, fallbackUid ?? null);
}

export async function POST(req: NextRequest) {
  const stripe = getStripe();

  try {
    const signature = req.headers.get("stripe-signature");
    if (!signature) {
      return new NextResponse("Missing stripe-signature header", { status: 400 });
    }

    const body = await req.text();
    const event = stripe.webhooks.constructEvent(
      body,
      signature,
      getWebhookSecret()
    );

    console.log("[stripe webhook] event:", event.type);

    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log("[stripe webhook] checkout.session.completed", {
          uid: session.metadata?.uid ?? null,
          role: session.metadata?.role ?? null,
          plan: session.metadata?.plan ?? null,
          customer: session.customer ?? null,
          subscription: session.subscription ?? null,
          payment_status: session.payment_status ?? null,
          mode: session.mode ?? null,
        });

        const handledCourseOrder = await syncCourseOrderFromCheckoutSession(session);
        if (handledCourseOrder) break;

        await syncFromCheckoutSession(session);

        if (session.subscription && typeof session.subscription === "string") {
          await syncSubscriptionById(
            stripe,
            session.subscription,
            session.metadata?.uid ?? null
          );
        }

        break;
      }

      case "customer.subscription.created":
      case "customer.subscription.updated": {
        const subscription = event.data.object as Stripe.Subscription;

        console.log(`[stripe webhook] ${event.type}`, {
          id: subscription.id,
          status: subscription.status,
          customer:
            typeof subscription.customer === "string"
              ? subscription.customer
              : subscription.customer?.id ?? null,
          uid: subscription.metadata?.uid ?? null,
          role: subscription.metadata?.role ?? null,
          plan: subscription.metadata?.plan ?? null,
          priceId: subscription.items.data[0]?.price?.id ?? null,
          cancelAtPeriodEnd: subscription.cancel_at_period_end ?? false,
        });

        await syncFromStripeSubscription(subscription);
        break;
      }

      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;

        const uid = subscription.metadata?.uid ?? null;
        const customerId = getCustomerId(subscription.customer);

        console.log("[stripe webhook] customer.subscription.deleted", {
          id: subscription.id,
          uid,
          customerId,
        });

        if (!uid) {
          await syncFromStripeSubscription(subscription).catch(async () => {
            throw new Error("Could not resolve uid for deleted subscription");
          });
        } else {
          await syncCanceledToFree({
            uid,
            role:
              (subscription.metadata?.role as
                | "student"
                | "teacher"
                | "parent"
                | undefined) ?? null,
            customerId,
            subscriptionId: subscription.id,
          });
        }

        break;
      }

      case "invoice.paid": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        console.log("[stripe webhook] invoice.paid", {
          subscriptionId,
        });

        await syncSubscriptionById(stripe, subscriptionId);
        break;
      }

      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const subscriptionId = getInvoiceSubscriptionId(invoice);

        console.log("[stripe webhook] invoice.payment_failed", {
          subscriptionId,
        });

        await syncSubscriptionById(stripe, subscriptionId);
        break;
      }

      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log("[stripe webhook] checkout.session.async_payment_succeeded", {
          uid: session.metadata?.uid ?? null,
          subscription: session.subscription ?? null,
        });

        const handledCourseOrder = await syncCourseOrderFromCheckoutSession(session);
        if (handledCourseOrder) break;

        if (session.subscription && typeof session.subscription === "string") {
          await syncSubscriptionById(
            stripe,
            session.subscription,
            session.metadata?.uid ?? null
          );
        }

        break;
      }

      case "checkout.session.async_payment_failed": {
        const session = event.data.object as Stripe.Checkout.Session;

        console.log("[stripe webhook] checkout.session.async_payment_failed", {
          uid: session.metadata?.uid ?? null,
          subscription: session.subscription ?? null,
        });

        const handledCourseOrder = await markCourseOrderFailedFromCheckoutSession(session);
        if (handledCourseOrder) break;

        if (session.subscription && typeof session.subscription === "string") {
          await syncSubscriptionById(
            stripe,
            session.subscription,
            session.metadata?.uid ?? null
          );
        }

        break;
      }

      default:
        console.log("[stripe webhook] ignored event:", event.type);
        break;
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Webhook handling failed";

    console.error("[stripe webhook] failed:", error);

    return new NextResponse(message, { status: 400 });
  }
}
