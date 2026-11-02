CREATE TABLE "PickNumberTicket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "betId" TEXT NOT NULL,
    "marketType" TEXT NOT NULL,
    "numbers" TEXT NOT NULL,
    "lockedOdds" DECIMAL NOT NULL,
    "oddsVersion" INTEGER NOT NULL,
    "ruleVersion" INTEGER NOT NULL,
    "matchedCount" INTEGER,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "PickNumberTicket_betId_fkey" FOREIGN KEY ("betId") REFERENCES "Bet" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "PickNumberTicket_betId_key" ON "PickNumberTicket"("betId");

UPDATE "Market" SET "active" = 0 WHERE "type" = 'PICK_SIX';
