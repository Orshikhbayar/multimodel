-- Server-enforced billing and repricing foundation

ALTER TABLE "users"
  ADD COLUMN "planId" TEXT NOT NULL DEFAULT 'free',
  ADD COLUMN "billingCadence" TEXT NOT NULL DEFAULT 'monthly',
  ADD COLUMN "billingCurrency" TEXT NOT NULL DEFAULT 'USD',
  ADD COLUMN "periodStartAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "periodEndAt" TIMESTAMP(3) NOT NULL DEFAULT (CURRENT_TIMESTAMP + INTERVAL '1 month'),
  ADD COLUMN "includedCreditsCents" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "topUpCreditsCents" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "billing_transactions" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "amountPaidCents" INTEGER NOT NULL,
  "creditDeltaCents" INTEGER NOT NULL,
  "balanceAfterCents" INTEGER NOT NULL,
  "currency" TEXT NOT NULL,
  "referenceId" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "billing_transactions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "billing_transactions_userId_createdAt_idx"
  ON "billing_transactions"("userId", "createdAt");

CREATE INDEX "billing_transactions_referenceId_idx"
  ON "billing_transactions"("referenceId");

ALTER TABLE "billing_transactions"
  ADD CONSTRAINT "billing_transactions_userId_fkey"
  FOREIGN KEY ("userId") REFERENCES "users"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
