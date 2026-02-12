import { beforeEach, describe, expect, it, vi } from "vitest";

type TransactionMock = {
  user: {
    findUnique: ReturnType<typeof vi.fn>;
    update?: ReturnType<typeof vi.fn>;
  };
  billingTransaction: {
    create: ReturnType<typeof vi.fn>;
  };
};

const { mockPrisma } = vi.hoisted(() => ({
  mockPrisma: {
    usageRecord: {
      aggregate: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    billingTransaction: {
      create: vi.fn(),
      count: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/db", () => ({
  default: mockPrisma,
}));

import {
  InsufficientCreditsError,
  calculateUsageCostCents,
  checkQuota,
  estimatePromptTokensFromMessages,
  estimateUsageHoldCents,
  reserveUsageHold,
} from "@/lib/billing/service";

describe("billing service", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("calculates deterministic model-weighted usage cost", () => {
    const cents = calculateUsageCostCents({
      modelId: "openai/gpt-4.1",
      promptTokens: 1000,
      completionTokens: 1000,
    });

    expect(cents).toBe(4);
  });

  it("estimates hold with safety margin above raw prompt estimation", () => {
    const holdCents = estimateUsageHoldCents({
      modelId: "openai/gpt-4.1",
      estimatedPromptTokens: 1000,
      maxOutputTokens: 1000,
    });
    const rawCents = calculateUsageCostCents({
      modelId: "openai/gpt-4.1",
      promptTokens: 1000,
      completionTokens: 1000,
    });

    expect(holdCents).toBeGreaterThanOrEqual(rawCents);
  });

  it("checks daily quota before monthly quota", async () => {
    mockPrisma.usageRecord.aggregate
      .mockResolvedValueOnce({ _sum: { totalTokens: 2500 } })
      .mockResolvedValueOnce({ _sum: { totalTokens: 2500 } });

    const quota = await checkQuota("user-1", "free");

    expect(quota.allowed).toBe(false);
    expect(quota.reason).toBe("daily");
    expect(quota.limit).toBe(2000);
    expect(quota.used).toBe(2500);
  });

  it("reserves hold using included credits first, then top-up credits", async () => {
    const user = {
      id: "user-1",
      includedCreditsCents: 3,
      topUpCreditsCents: 5,
    };

    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: TransactionMock) => unknown) => {
      const tx = {
        user: {
          findUnique: vi.fn().mockResolvedValue(user),
          update: vi
            .fn()
            .mockResolvedValue({ id: user.id, includedCreditsCents: 0, topUpCreditsCents: 4 }),
        },
        billingTransaction: {
          create: vi.fn().mockResolvedValue({ id: "hold-tx-1" }),
        },
      };

        return callback(tx);
      },
    );

    const hold = await reserveUsageHold({
      userId: "user-1",
      referenceId: "chat:req-1",
      modelId: "openai/gpt-4.1",
      estimatedPromptTokens: 1000,
      maxOutputTokens: 1000,
    });

    expect(hold.amountCents).toBe(4);
    expect(hold.includedDebitedCents).toBe(3);
    expect(hold.topUpDebitedCents).toBe(1);
  });

  it("throws INSUFFICIENT_CREDITS when balance is below hold amount", async () => {
    mockPrisma.$transaction.mockImplementation(
      async (callback: (tx: TransactionMock) => unknown) => {
      const tx = {
        user: {
          findUnique: vi
            .fn()
            .mockResolvedValue({ id: "user-1", includedCreditsCents: 1, topUpCreditsCents: 0 }),
        },
        billingTransaction: {
          create: vi.fn(),
        },
      };

        return callback(tx);
      },
    );

    await expect(
      reserveUsageHold({
        userId: "user-1",
        referenceId: "chat:req-2",
        modelId: "openai/gpt-4.1",
        estimatedPromptTokens: 1000,
        maxOutputTokens: 1000,
      }),
    ).rejects.toBeInstanceOf(InsufficientCreditsError);
  });

  it("estimates prompt tokens from message content", () => {
    const tokens = estimatePromptTokensFromMessages([
      { content: "hello world" },
      { content: "abc" },
    ]);

    expect(tokens).toBe(Math.ceil(("hello world".length + 3) / 3));
  });
});
