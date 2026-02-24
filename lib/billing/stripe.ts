import crypto from "node:crypto";

export type StripeCheckoutMode = "payment" | "subscription";

export type StripeCheckoutSessionRequest = {
  mode: StripeCheckoutMode;
  lineItems: Array<{
    price: string;
    quantity?: number;
  }>;
  customer?: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
};

export type StripeCheckoutSessionResponse = {
  id: string;
  url: string;
  payment_status?: string;
  amount_total?: number;
  customer?: string;
  payment_intent?: string | null;
  metadata?: Record<string, string>;
};

export type StripeCustomerResponse = {
  id: string;
  email?: string | null;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  data: {
    object: Record<string, unknown>;
  };
};

function getStripeSecretKey() {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Missing STRIPE_SECRET_KEY environment variable");
  }
  return key;
}

export function isStripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

function appendLineItems(
  form: URLSearchParams,
  lineItems: StripeCheckoutSessionRequest["lineItems"],
) {
  lineItems.forEach((item, index) => {
    form.set(`line_items[${index}][price]`, item.price);
    form.set(`line_items[${index}][quantity]`, String(item.quantity ?? 1));
  });
}

function appendMetadata(form: URLSearchParams, metadata?: Record<string, string>) {
  if (!metadata) return;
  for (const [key, value] of Object.entries(metadata)) {
    form.set(`metadata[${key}]`, value);
  }
}

export async function createStripeCheckoutSession(
  params: StripeCheckoutSessionRequest,
): Promise<StripeCheckoutSessionResponse> {
  const secretKey = getStripeSecretKey();

  const form = new URLSearchParams();
  form.set("mode", params.mode);
  form.set("success_url", params.successUrl);
  form.set("cancel_url", params.cancelUrl);

  if (params.customer) {
    form.set("customer", params.customer);
  } else if (params.customerEmail) {
    form.set("customer_email", params.customerEmail);
  }

  appendLineItems(form, params.lineItems);
  appendMetadata(form, params.metadata);

  const response = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as
    | StripeCheckoutSessionResponse
    | {
        error?: {
          message?: string;
        };
      }
    | null;

  if (!response.ok || !payload || !("id" in payload) || !("url" in payload)) {
    const message =
      payload && "error" in payload
        ? payload.error?.message || "Failed to create Stripe checkout session"
        : "Failed to create Stripe checkout session";
    throw new Error(message);
  }

  return payload;
}

export async function createStripeCustomer(params: {
  email?: string | null;
  metadata?: Record<string, string>;
}): Promise<StripeCustomerResponse> {
  const secretKey = getStripeSecretKey();
  const form = new URLSearchParams();

  if (params.email) {
    form.set("email", params.email);
  }

  appendMetadata(form, params.metadata);

  const response = await fetch("https://api.stripe.com/v1/customers", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form,
  });

  const payload = (await response.json().catch(() => null)) as
    | StripeCustomerResponse
    | {
        error?: { message?: string };
      }
    | null;

  if (!response.ok || !payload || !("id" in payload)) {
    const message =
      payload && "error" in payload
        ? payload.error?.message || "Failed to create Stripe customer"
        : "Failed to create Stripe customer";
    throw new Error(message);
  }

  return payload;
}

function constantTimeEquals(a: string, b: string) {
  const aBuf = Buffer.from(a, "utf8");
  const bBuf = Buffer.from(b, "utf8");
  if (aBuf.length !== bBuf.length) {
    return false;
  }
  return crypto.timingSafeEqual(aBuf, bBuf);
}

export function verifyStripeWebhookSignature(params: {
  payload: string;
  signatureHeader: string | null;
  secret: string;
  toleranceSeconds?: number;
}) {
  if (!params.signatureHeader) {
    return false;
  }

  const elements = params.signatureHeader.split(",").map((part) => part.trim());
  const timestamp = elements.find((element) => element.startsWith("t="))?.slice(2);

  const signatures = elements
    .filter((element) => element.startsWith("v1="))
    .map((element) => element.slice(3));

  if (!timestamp || signatures.length === 0) {
    return false;
  }

  const timestampSeconds = Number.parseInt(timestamp, 10);
  if (!Number.isFinite(timestampSeconds)) {
    return false;
  }

  const toleranceSeconds = params.toleranceSeconds ?? 300;
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampSeconds);
  if (ageSeconds > toleranceSeconds) {
    return false;
  }

  const signedPayload = `${timestamp}.${params.payload}`;
  const expected = crypto
    .createHmac("sha256", params.secret)
    .update(signedPayload, "utf8")
    .digest("hex");

  return signatures.some((signature) => constantTimeEquals(signature, expected));
}

export function parseStripeWebhookEvent(payload: string): StripeWebhookEvent {
  const parsed = JSON.parse(payload) as StripeWebhookEvent;

  if (!parsed?.id || !parsed?.type || !parsed?.data?.object) {
    throw new Error("Invalid Stripe webhook payload");
  }

  return parsed;
}
