CREATE TABLE "PickSixTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "betId" TEXT NOT NULL,
    "numbers" TEXT NOT NULL,
    "tierMultipliers" TEXT NOT NULL,
    "scheduleIncludes49" BOOLEAN NOT NULL,
    "scheduleVersion" INTEGER NOT NULL,
    "matchedCount" INTEGER,
    "winningTier" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickSixTicket_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PickSixTicket_betId_key" ON "PickSixTicket"("betId");
CREATE INDEX "WalletSession_walletId_expiresAt_idx" ON "WalletSession"("walletId", "expiresAt");
CREATE INDEX "PaymentOrder_walletId_createdAt_idx" ON "PaymentOrder"("walletId", "createdAt");
CREATE INDEX "PaymentOrder_status_expiresAt_idx" ON "PaymentOrder"("status", "expiresAt");

ALTER TABLE "PaymentOrder" ADD COLUMN "idempotencyKey" TEXT;
CREATE UNIQUE INDEX "PaymentOrder_walletId_idempotencyKey_key" ON "PaymentOrder"("walletId", "idempotencyKey");
