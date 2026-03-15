import { TOP_UP_PACKS } from "@/lib/billing/plans";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import {
  parseStripeWebhookEvent,
  verifyStripeWebhookSignature,
  type StripeWebhookEvent,
} from "@/lib/billing/stripe";

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET environment variable");
  }
  return secret;
}

function resolvePlanFromPriceId(priceId: string | null | undefined) {
  if (!priceId) return null;

  const byPrice = [
    {
      planId: "plus",
      cadence: "monthly",
      priceId: process.env.STRIPE_PRICE_PLUS_MONTHLY,
    },
    {
      planId: "plus",
      cadence: "annual",
      priceId: process.env.STRIPE_PRICE_PLUS_ANNUAL,
    },
    {
      planId: "pro",
      cadence: "monthly",
      priceId: process.env.STRIPE_PRICE_PRO_MONTHLY,
    },
    {
      planId: "pro",
      cadence: "annual",
      priceId: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
    {
      planId: "team",
      cadence: "monthly",
      priceId: process.env.STRIPE_PRICE_TEAM_MONTHLY,
    },
    {
      planId: "team",
      cadence: "annual",
      priceId: process.env.STRIPE_PRICE_TEAM_ANNUAL,
    },
  ];

  return byPrice.find((entry) => entry.priceId === priceId) ?? null;
}

function getTopUpCreditDelta(packId: string | null | undefined) {
  if (!packId) return null;
  const pack = TOP_UP_PACKS.find((item) => item.id === packId);
  if (!pack) return null;
  return Math.round(pack.creditUsd * 100);
}

async function getUserIdByStripeCustomer(
  customerId: string | null | undefined,
) {
  if (!customerId) return null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("stripe_customer_id", customerId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  return data?.id ?? null;
}

function getInvoicePeriod(object: Record<string, unknown>) {
  const periodStartSeconds =
    typeof object.period_start === "number" ? object.period_start : undefined;
  const periodEndSeconds =
    typeof object.period_end === "number" ? object.period_end : undefined;

  if (periodStartSeconds && periodEndSeconds) {
    return {
      periodStartISO: new Date(periodStartSeconds * 1000).toISOString(),
      periodEndISO: new Date(periodEndSeconds * 1000).toISOString(),
    };
  }

  const now = new Date();
  const start = now.toISOString();
  const end = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

  return {
    periodStartISO: start,
    periodEndISO: end,
  };
}

async function handleCheckoutSessionCompleted(event: StripeWebhookEvent) {
  const admin = createSupabaseAdminClient();
  const object = event.data.object;
  const metadata = (object.metadata ?? {}) as Record<string, string>;

  if (metadata.kind !== "topup") {
    return;
  }

  const paymentStatus =
    typeof object.payment_status === "string" ? object.payment_status : null;
  if (
    paymentStatus &&
    paymentStatus !== "paid" &&
    paymentStatus !== "no_payment_required"
  ) {
    return;
  }

  const userId =
    metadata.user_id ??
    (await getUserIdByStripeCustomer(object.customer as string | undefined));
  if (!userId) {
    return;
  }

  const creditDeltaInt = getTopUpCreditDelta(metadata.pack_id);
  if (!creditDeltaInt) {
    return;
  }

  const amountUsdInt =
    typeof object.amount_total === "number" ? object.amount_total : 0;
  const stripeObjectId =
    (typeof object.payment_intent === "string" && object.payment_intent) ||
    (typeof object.id === "string" ? object.id : event.id);

  const { error } = await admin.rpc("apply_topup_webhook", {
    p_user_id: userId,
    p_credit_delta_int: creditDeltaInt,
    p_amount_usd_int: amountUsdInt,
    p_stripe_event_id: event.id,
    p_stripe_object_id: stripeObjectId,
    p_reference_id: `checkout:${typeof object.id === "string" ? object.id : event.id}`,
    p_metadata: {
      checkout_session_id: typeof object.id === "string" ? object.id : null,
      pack_id: metadata.pack_id,
    },
  });

  if (error) {
    throw error;
  }
}

async function handleInvoicePaid(event: StripeWebhookEvent) {
  const admin = createSupabaseAdminClient();
  const object = event.data.object;

  const customerId =
    typeof object.customer === "string" ? object.customer : null;
  const userId = await getUserIdByStripeCustomer(customerId);
  if (!userId) {
    return;
  }

  const lines = ((
    object.lines as { data?: Array<Record<string, unknown>> } | undefined
  )?.data ?? []) as Array<Record<string, unknown>>;
  const firstLine = lines[0];

  const linePrice =
    (firstLine?.price as { id?: string } | undefined)?.id ??
    (object as { price?: { id?: string } }).price?.id ??
    null;

  const resolvedPlan = resolvePlanFromPriceId(linePrice);
  if (!resolvedPlan) {
    return;
  }

  const amountPaidInt =
    typeof object.amount_paid === "number" ? object.amount_paid : 0;
  const subscriptionId =
    typeof object.subscription === "string" ? object.subscription : "";
  const period = getInvoicePeriod(object);

  const { error } = await admin.rpc("apply_subscription_invoice_webhook", {
    p_user_id: userId,
    p_plan_id: resolvedPlan.planId,
    p_cadence: resolvedPlan.cadence,
    p_amount_usd_int: amountPaidInt,
    p_period_start: period.periodStartISO,
    p_period_end: period.periodEndISO,
    p_stripe_event_id: event.id,
    p_stripe_object_id: typeof object.id === "string" ? object.id : event.id,
    p_subscription_id: subscriptionId,
    p_subscription_status: "active",
  });

  if (error) {
    throw error;
  }
}

async function handleSubscriptionSync(event: StripeWebhookEvent) {
  const admin = createSupabaseAdminClient();
  const object = event.data.object;

  const customerId =
    typeof object.customer === "string" ? object.customer : null;
  const userId = await getUserIdByStripeCustomer(customerId);
  if (!userId) {
    return;
  }

  const status = typeof object.status === "string" ? object.status : null;
  const subscriptionId = typeof object.id === "string" ? object.id : null;

  const updates: Record<string, string | null> = {
    stripe_subscription_status: status,
  };

  if (subscriptionId) {
    updates.stripe_subscription_id = subscriptionId;
  }

  const firstItem =
    ((object.items as { data?: Array<{ price?: { id?: string } }> } | undefined)
      ?.data ?? [])[0] ?? null;
  const priceId = firstItem?.price?.id ?? null;
  const resolvedPlan = resolvePlanFromPriceId(priceId);

  if (resolvedPlan) {
    updates.plan_id = resolvedPlan.planId;
    updates.billing_cadence = resolvedPlan.cadence;
  }

  const { error } = await admin
    .from("profiles")
    .update(updates)
    .eq("id", userId);
  if (error) {
    throw error;
  }
}

async function handleReversal(event: StripeWebhookEvent) {
  const admin = createSupabaseAdminClient();
  const object = event.data.object;

  const customerId =
    typeof object.customer === "string" ? object.customer : null;
  const userId = await getUserIdByStripeCustomer(customerId);
  if (!userId) {
    return;
  }

  const paymentIntent =
    typeof object.payment_intent === "string" ? object.payment_intent : null;
  const lookupStripeObjectId =
    paymentIntent ?? (typeof object.id === "string" ? object.id : null);

  let originalPurchase: { credit_delta_int: number } | null = null;
  if (lookupStripeObjectId) {
    const { data, error: lookupError } = await admin
      .from("credit_ledger_events")
      .select("credit_delta_int")
      .eq("user_id", userId)
      .eq("type", "topup_purchase")
      .eq("stripe_object_id", lookupStripeObjectId)
      .order("created_at", { ascending: false })
      .maybeSingle();

    if (lookupError) {
      throw lookupError;
    }

    originalPurchase = data;
  }

  const amountUsdInt =
    typeof object.amount_refunded === "number"
      ? object.amount_refunded
      : typeof object.amount === "number"
        ? object.amount
        : 0;

  const creditDeltaInt = originalPurchase?.credit_delta_int ?? amountUsdInt;

  const { error } = await admin.rpc("apply_reversal_webhook", {
    p_user_id: userId,
    p_credit_delta_int: creditDeltaInt,
    p_amount_usd_int: amountUsdInt,
    p_stripe_event_id: event.id,
    p_stripe_object_id:
      paymentIntent ?? (typeof object.id === "string" ? object.id : event.id),
    p_reference_id: `reversal:${typeof object.id === "string" ? object.id : event.id}`,
    p_metadata: {
      event_type: event.type,
      lock_reason:
        event.type === "charge.dispute.created"
          ? "stripe_dispute"
          : "stripe_reversal",
    },
  });

  if (error) {
    throw error;
  }
}

async function processStripeEvent(event: StripeWebhookEvent) {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event);
      return;
    case "invoice.paid":
      await handleInvoicePaid(event);
      return;
    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted":
      await handleSubscriptionSync(event);
      return;
    case "charge.refunded":
    case "charge.dispute.created":
    case "charge.dispute.funds_withdrawn":
      await handleReversal(event);
      return;
    default:
      return;
  }
}

export async function POST(request: Request) {
  const payload = await request.text();
  const signatureHeader = request.headers.get("stripe-signature");

  let webhookSecret: string;
  try {
    webhookSecret = getWebhookSecret();
  } catch (error) {
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const isValid = verifyStripeWebhookSignature({
    payload,
    signatureHeader,
    secret: webhookSecret,
  });

  if (!isValid) {
    return new Response(JSON.stringify({ error: "Invalid Stripe signature" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  let event: StripeWebhookEvent;
  try {
    event = parseStripeWebhookEvent(payload);
  } catch {
    return new Response(JSON.stringify({ error: "Invalid Stripe payload" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const admin = createSupabaseAdminClient();

  const { data: existing, error: existingError } = await admin
    .from("stripe_webhook_events")
    .select("id")
    .eq("stripe_event_id", event.id)
    .maybeSingle();

  if (existingError) {
    return new Response(
      JSON.stringify({ error: "Failed to query webhook idempotency" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  if (existing) {
    return new Response(JSON.stringify({ ok: true, replay: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    await processStripeEvent(event);
  } catch {
    return new Response(
      JSON.stringify({ error: "Failed to process webhook event" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  const { error: insertError } = await admin
    .from("stripe_webhook_events")
    .insert({
      stripe_event_id: event.id,
      type: event.type,
      metadata: event.data.object as Json,
    });

  if (insertError && insertError.code !== "23505") {
    return new Response(
      JSON.stringify({ error: "Failed to persist webhook idempotency" }),
      { status: 500, headers: { "Content-Type": "application/json" } },
    );
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
