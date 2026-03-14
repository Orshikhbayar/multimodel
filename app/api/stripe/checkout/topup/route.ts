import { auth } from "@/lib/auth";
import type { TopUpPackId } from "@/lib/billing/types";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  createStripeCheckoutSession,
  createStripeCustomer,
  isStripeConfigured,
} from "@/lib/billing/stripe";

type RequestBody = {
  packId: TopUpPackId;
  successUrl?: string;
  cancelUrl?: string;
};

function getTopUpPriceId(packId: TopUpPackId) {
  const priceMap: Record<TopUpPackId, string | undefined> = {
    starter: process.env.STRIPE_PRICE_TOPUP_STARTER,
    boost: process.env.STRIPE_PRICE_TOPUP_BOOST,
    power: process.env.STRIPE_PRICE_TOPUP_POWER,
  };

  return priceMap[packId];
}

function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}

export async function POST(request: Request) {
  if (!isStripeConfigured()) {
    return new Response(JSON.stringify({ error: "Stripe is not configured" }), {
      status: 503,
      headers: { "Content-Type": "application/json" },
    });
  }

  const session = await auth();
  if (!session?.user?.id) {
    return new Response(JSON.stringify({ error: "Authentication required" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  const body = (await request.json()) as RequestBody;
  if (!body?.packId) {
    return new Response(JSON.stringify({ error: "packId is required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const priceId = getTopUpPriceId(body.packId);
  if (!priceId) {
    return new Response(
      JSON.stringify({
        error: "Missing Stripe price id for selected top-up pack",
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
  const successUrl =
    body.successUrl ?? `${baseUrl}/dashboard/billing?topup=success`;
  const cancelUrl =
    body.cancelUrl ?? `${baseUrl}/dashboard/billing?topup=cancelled`;

  const checkout = await createStripeCheckoutSession({
    mode: "payment",
    lineItems: [{ price: priceId, quantity: 1 }],
    customer: customerId,
    successUrl,
    cancelUrl,
    metadata: {
      kind: "topup",
      user_id: session.user.id,
      pack_id: body.packId,
    },
  });

  return new Response(JSON.stringify({ id: checkout.id, url: checkout.url }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
