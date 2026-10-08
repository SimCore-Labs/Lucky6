# Implementation Checklist - Lucky Six Web3 Real-Time Game

## Phase 1: Documentation & Setup
- [x] Create `docs/IMPLEMENTATION_CHECKLIST.md`.
- [x] List all prompt requirements in the checklist.
- [x] Verify live PostgreSQL connection using Prisma Client.

## Phase 2: Dynamic Odds & Seed Data
- [ ] Seed Lucky Six markets, selections, and pricing parameters (`prisma/seed.ts`).
- [ ] Verify `PricingEngineService` computes dynamic versioned odds based on house margin and exposure without static hardcoded odds.

## Phase 3: The Draw Engine (`@lucky-six/engine`)
- [x] Implement 5-minute scheduler loop and DB state machine (`OPEN` -> `CLOSED` -> `DRAWING` -> `SETTLEMENT` -> `SETTLED`).
- [x] Generate 6 distinct balls (1-48 normal, 49 Black Jackpot entity) using `mathematics.ts`.
- [x] Insert new `Draw`, `DrawBall`s, and `DrawStatistic`s into live PostgreSQL DB.
- [x] Publish domain events (`draw.state_changed`, `ball.drawn`, `draw.completed`) over Redis Pub/Sub.
- [x] Verify draw lifecycle and DB records created.

## Phase 4: The Backend API (`backend`)
- [x] Web3 Auth (`/auth`): Challenge/response nonce generation, ed25519 signature verification (`@solana/kit` / `tweetnacl`), session cookie creation.
- [x] Betting (`/game/bets`): Atomic bet placement, `OPEN` status check, balance check, `$transaction` debit & ledger entry, `idempotencyKey` enforcement.
- [x] Realtime Gateway (`realtime`): Redis subscriber listening to draw events and broadcasting via Socket.IO (`DRAW_STATE_CHANGED`, `BALL_DRAWN`, `DRAW_COMPLETED`).
- [x] Verification: Test script executing login, bet placement, and ledger balance deduction on live DB.

## Phase 5: Settlement Engine (`@lucky-six/settlement`)
- [x] Listener/poller for completed draws awaiting settlement.
- [x] Fetch pending `Bet` records and evaluate selections using `SettlementEvaluatorService`.
- [x] Payouts: Calculate `stake * lockedOdds`, update user `LedgerAccount` balance with `LedgerEntry` (`BET_WIN`), update `Bet` status (`WON` / `LOST`), and record `Settlement`.
- [x] Verification: Trigger settlement on test bet and confirm ledger deposit on live DB.

## Phase 6: Payment Worker (`@lucky-six/payment-worker`)
- [x] Solana Listener/Verifier: Monitor pending `PaymentOrder`s and verify on-chain transactions via `@solana/kit` Devnet RPC.
- [x] Verify recipient treasury wallet, lamports amount, finality, and idempotency.
- [x] Price Quote interface: Convert SOL lamports to USD and SIM credits.
- [x] Credit user `LedgerAccount` with `CREDIT_PURCHASE` ledger entry and update order status to `CREDITED`.
- [x] Verification: Run test payment payload through service and confirm balance credit in live DB.

## Phase 7: End-to-End Game Loop Verification
- [x] Run full end-to-end integration test (Auth -> Draw Generation -> Bet Placement -> Drawing -> Settlement -> Payout & Payment Deposit).
- [x] Confirm all data records and balance updates in live DB.
