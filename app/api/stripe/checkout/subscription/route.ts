import { auth } from "@/lib/auth";
import type { BillingCadence, PlanId } from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  isStripeConfigured,
} from "@/lib/billing/stripe";

type RequestBody = {
  planId: PlanId;
  cadence: BillingCadence;
  successUrl?: string;
  cancelUrl?: string;
};

function getSubscriptionPriceId(planId: PlanId, cadence: BillingCadence) {
  const priceMap: Record<PlanId, { monthly?: string; annual?: string }> = {
    free: {},
    plus: {
      monthly: process.env.STRIPE_PRICE_PLUS_MONTHLY,
      annual: process.env.STRIPE_PRICE_PLUS_ANNUAL,
    },
    pro: {
      monthly: process.env.STRIPE_PRICE_PRO_MONTHLY,
      annual: process.env.STRIPE_PRICE_PRO_ANNUAL,
    },
    team: {
      monthly: process.env.STRIPE_PRICE_TEAM_MONTHLY,
      annual: process.env.STRIPE_PRICE_TEAM_ANNUAL,
    },
  };

  const selected = priceMap[planId];
  return cadence === "annual" ? selected.annual : selected.monthly;
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return new Response(
      JSON.stringify({ error: "Stripe is not configured" }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response(
      JSON.stringify({ error: "Authentication required" }),
      { status: 401, headers: { "Content-Type": "application/json" } },
    );
  }

  const body = (await request.json()) as RequestBody;
  if (!body?.planId || !body?.cadence) {
    return new Response(
      JSON.stringify({ error: "planId and cadence are required" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  if (body.planId === "free") {
    return new Response(
      JSON.stringify({ error: "Free plan does not require checkout" }),
      { status: 400, headers: { "Content-Type": "application/json" } },
    );
  }

  const priceId = getSubscriptionPriceId(body.planId, body.cadence);
  if (!priceId) {
    return new Response(
      JSON.stringify({
        error: "Missing Stripe price id for the selected subscription",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } },
    );
  }

  const admin = createSupabaseAdminClient();
  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,email,stripe_customer_id")
    .eq("id", session.user.id)
    .single();

  if (profileError || !profile) {
    return new Response(
      JSON.stringify({ error: "Billing profile not found" }),
      { status: 404, headers: { "Content-Type": "application/json" } },
    );
  }

  let customerId = profile.stripe_customer_id;

  if (!customerId) {
    const customer = await createStripeCustomer({
      email: session.user.email,
      metadata: {
        user_id: session.user.id,
      },
    });

    customerId = customer.id;

    const { error: updateError } = await admin
      .from("profiles")
      .update({ stripe_customer_id: customerId })
      .eq("id", session.user.id);

    if (updateError) {
      return new Response(
        JSON.stringify({ error: "Failed to persist Stripe customer" }),
        { status: 500, headers: { "Content-Type": "application/json" } },
      );
    }
  }

  const baseUrl = getAppUrl();
  const successUrl = body.successUrl ?? `${baseUrl}/dashboard/billing?checkout=success`;
  const cancelUrl = body.cancelUrl ?? `${baseUrl}/dashboard/plans?checkout=cancelled`;

  const checkout = await createStripeCheckoutSession({
    mode: "subscription",
    lineItems: [{ price: priceId, quantity: 1 }],
    customer: customerId,
    successUrl,
    cancelUrl,
    metadata: {
      kind: "subscription",
      user_id: session.user.id,
      plan_id: body.planId,
      cadence: body.cadence,
    },
  });

  return new Response(
    JSON.stringify({ id: checkout.id, url: checkout.url }),
    { status: 200, headers: { "Content-Type": "application/json" } },
  );
}
