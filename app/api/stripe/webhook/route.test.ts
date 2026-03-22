import { beforeEach, describe, expect, it, vi } from "vitest";

function createTableMock() {
  const table: Record<string, (...args: unknown[]) => unknown> = {
    select: vi.fn(() => table),
    eq: vi.fn(() => table),
    in: vi.fn(() => table),
    order: vi.fn(() => table),
    maybeSingle: vi.fn(async () => ({ data: null, error: null })),
    insert: vi.fn(async () => ({ error: null })),
    update: vi.fn(() => table),
  };

  return table;
}

const { mockCreateSupabaseAdminClient, mockVerifySignature, mockParseEvent } =
  vi.hoisted(() => ({
    mockCreateSupabaseAdminClient: vi.fn(),
    mockVerifySignature: vi.fn(() => true),
    mockParseEvent: vi.fn(),
  }));

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: mockCreateSupabaseAdminClient,
}));

vi.mock("@/lib/billing/stripe", () => ({
  verifyStripeWebhookSignature: mockVerifySignature,
  parseStripeWebhookEvent: mockParseEvent,
}));

import { POST } from "@/app/api/stripe/webhook/route";

describe("stripe webhook route", () => {
  const stripeEvents = createTableMock();
  const profiles = createTableMock();
  const ledger = createTableMock();
  const mockRpc = vi.fn(async () => ({ error: null }));

  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("STRIPE_WEBHOOK_SECRET", "whsec_test");

    mockCreateSupabaseAdminClient.mockReturnValue({
      from: vi.fn((table: string) => {
        if (table === "stripe_webhook_events") return stripeEvents;
        if (table === "profiles") return profiles;
        if (table === "credit_ledger_events") return ledger;
        throw new Error(`Unexpected table ${table}`);
      }),
      rpc: mockRpc,
    });

    stripeEvents.maybeSingle.mockResolvedValue({ data: null, error: null });
    stripeEvents.insert.mockResolvedValue({ error: null });
    profiles.maybeSingle.mockResolvedValue({ data: null, error: null });
    ledger.maybeSingle.mockResolvedValue({ data: null, error: null });
  });

  function requestWithSignature(payload: string) {
    return new Request("http://localhost:3000/api/stripe/webhook", {
      method: "POST",
      headers: {
        "stripe-signature": "t=1,v1=abc",
      },
      body: payload,
    });
  }

  it("returns replay=true when event already processed", async () => {
    mockParseEvent.mockReturnValue({
      id: "evt_existing",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_test",
          metadata: { kind: "topup", user_id: "user-1", pack_id: "starter" },
          payment_status: "paid",
          amount_total: 1200,
        },
      },
    });

    stripeEvents.maybeSingle.mockResolvedValueOnce({
      data: { id: "webhook-1" },
      error: null,
    });

    const response = await POST(requestWithSignature("{}"));
    expect(response.status).toBe(200);

    const body = await response.json();
    expect(body.replay).toBe(true);
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("ignores top-up checkout when pack is not found", async () => {
    mockParseEvent.mockReturnValue({
      id: "evt_topup",
      type: "checkout.session.completed",
      data: {
        object: {
          id: "cs_topup",
          metadata: { kind: "topup", user_id: "user-1", pack_id: "starter" },
          payment_status: "paid",
          amount_total: 1200,
          payment_intent: "pi_topup",
        },
      },
    });

    const response = await POST(requestWithSignature("{}"));

    expect(response.status).toBe(200);
    // TOP_UP_PACKS is empty, so the webhook returns early without calling RPC
    expect(mockRpc).not.toHaveBeenCalled();
  });

  it("applies reversal and lock metadata for disputes", async () => {
    mockParseEvent.mockReturnValue({
      id: "evt_dispute",
      type: "charge.dispute.created",
      data: {
        object: {
          id: "dp_1",
          customer: "cus_1",
          payment_intent: "pi_ref",
          amount: 1200,
        },
      },
    });

    profiles.maybeSingle.mockResolvedValue({
      data: { id: "user-1" },
      error: null,
    });

    ledger.maybeSingle.mockResolvedValue({
      data: { credit_delta_int: 2500 },
      error: null,
    });

    const response = await POST(requestWithSignature("{}"));

    expect(response.status).toBe(200);
    expect(mockRpc).toHaveBeenCalledWith("apply_reversal_webhook", {
      p_user_id: "user-1",
      p_credit_delta_int: 2500,
      p_amount_usd_int: 1200,
      p_stripe_event_id: "evt_dispute",
      p_stripe_object_id: "pi_ref",
      p_reference_id: "reversal:dp_1",
      p_metadata: {
        event_type: "charge.dispute.created",
        lock_reason: "stripe_dispute",
      },
    });
  });
});
