# Lucky Six: game, API, and frontend integration guide

This guide describes the behavior present in the repository today. It is
intended to help frontend work integrate with the backend without treating
planned or declared features as live API behavior.

## 1. System at a glance

Lucky Six is a six-number draw game with a NestJS/Fastify HTTP API and four
backend processes:

| Workspace | Responsibility | Runtime role |
| --- | --- | --- |
| `backend` | Public HTTP API, wallet challenges, draw/market reads, bet placement, health, and Socket.IO gateway | Public API on port 4000 |
| `engine` | Opens rounds, closes betting, generates six results, stores the result, and publishes draw events | Internal worker on port 4100 |
| `settlement` | Evaluates accepted bets against a completed draw and credits winning payouts | Internal worker on port 4200 |
| `payment-worker` | Polls stored payment orders, verifies submitted Solana transactions, and credits SIM | Internal worker on port 4300 |
| `packages/contracts` | Shared TypeScript names and DTO interfaces | Build-time shared package |

Turso (SQLite/libSQL) is authoritative for draws, wallets, bets, odds, payment records, and
ledger entries. Redis Pub/Sub on `lucky-six:events` carries events between
workers and the API's Socket.IO gateway. The frontend is a separate Next.js app
in `frontend`; production hosting is on Vercel, while the API is exposed as
`https://luckyapi.muizdev.xyz`.

The frontend may animate and present results, but it must treat API results,
market odds, bet acceptance, balances, and settlement as server-owned data.

## 2. Game rules implemented in the draw engine

The draw implementation is in `engine/src/domain/draw/mathematics.ts`.

1. A draw contains six distinct balls, each with an `orderIndex` from 0 through
   5. The index is the reveal order; it is not the sorted numeric order.
2. Normal numbers range from 1 through 48. Number 49 is the black jackpot ball.
3. The generator includes 49 with a default probability of 2%. Otherwise it
   samples six distinct values from 1 through 48. When 49 is selected, five
   normal numbers are selected and the six results are shuffled.
4. Ball colors repeat red, blue, green across the normal numbers:

   | Number | Color |
   | --- | --- |
   | 1, 4, 7, …, 46 | `RED` |
   | 2, 5, 8, …, 47 | `BLUE` |
   | 3, 6, 9, …, 48 | `GREEN` |
   | 49 | `BLACK` |

5. Statistics include the sum of all six numbers, whether 49 appeared, and the
   majority among the three normal colors. Black is excluded from the majority
   comparison. A tie for the largest normal-color count produces
   `majorityColor: null`.

Previously saved draws retain their stored colors. The engine assigns the
repeating red/blue/green sequence to draws generated after this change; the
frontend may still encounter `YELLOW` on an older active draw.

The generator currently uses `Math.random`; the code does not provide a
cryptographic or publicly verifiable randomness proof.

For the frontend, render six result positions and preserve the API's
`orderIndex`. A display may initially show six empty positions, then reveal
numbers as events arrive. The illustrative balls numbered 1–6 are not the
game's fixed result: real results may be any six distinct numbers from 1–48,
with 49 possible as the jackpot ball.

## 3. Draw lifecycle and worker coordination

`engine/src/draw-scheduler.service.ts` runs a lifecycle check every three
seconds:

```text
OPEN -- closeAt reached --> CLOSED
CLOSED -- drawAt reached --> DRAWING
DRAWING -- numbers/statistics persisted --> SETTLEMENT_PENDING
SETTLEMENT_PENDING -- accepted bets processed --> SETTLED
```

- When it finds no active draw, the engine creates the next draw as `OPEN`.
  Draw numbers start at 1 if there is no earlier draw.
- A new draw is open for four minutes. `drawAt` is 30 seconds after `closeAt`,
  leaving a closed interval before results are generated.
- The engine writes each result ball and the statistics to Turso, sets
  `resultAt`, then publishes `ball.drawn` once per ball and `draw.completed`.
- The API keeps the active draw and the most recent complete result available
  together. This lets the frontend keep displaying the prior result while the
  next round is open, even after settlement changes the completed draw to
  `SETTLED`.
- The worker publishes `draw.created`, `draw.open`, `draw.closed`, and
  `draw.started` at their respective transitions.

The implementation does not transition through every status in the Prisma
enum. `CLOSING`, `RESULT_READY`, and `SETTLEMENT_PENDING` handling are not all
used as a complete staged lifecycle: results go directly to
`SETTLEMENT_PENDING`, then settlement sets `SETTLED`.

The API's `GET /draws/current` is read-only. It uses the same active statuses as the
engine: `OPEN`, `CLOSING`, `CLOSED`, `DRAWING`, `RESULT_READY`, and
`SETTLEMENT_PENDING`. The response includes `latestResult`, the most recent
complete result (including `SETTLED` draws), separately from the current
round's clock and status. If the engine has not created an active draw, the
API returns HTTP 200 with a JSON `null` body. This is a normal no-active-draw
state, not an API error. It does not create a draw; creation and lifecycle
transitions belong to the engine.

For the one-time pre-launch test-data reset, stop all four PM2 services, apply
pending migrations, then run
`npm run db:reset-draw-data --workspace=backend -- --confirm-reset-draw-data --services-stopped`.
The guarded command deletes draw rows and their balls, statistics, bets,
selections, and settlements. It deliberately preserves wallets, balances,
payment records, and ledger entries. The engine then starts at draw 1.

The engine processes the oldest unfinished draw before moving to a newer one.
Draw creation uses the unique draw-number constraint, while result balls,
statistics, and the transition to `SETTLEMENT_PENDING` are committed together.
An interrupted `DRAWING` state is retried on the next scheduler tick.

## 4. HTTP API: endpoints that exist now

Base URL:

```text
https://luckyapi.muizdev.xyz
```

For local Next.js development, `frontend/.env.local` uses
`NEXT_PUBLIC_API_URL`. The deployed API must allow the exact browser origin in
`CORS_ORIGIN`; the current deployment allows both the Vercel origin and
`http://localhost:3000`.

### `GET /`

Basic service response:

```json
{ "service": "lucky-six-api", "status": "ok" }
```

### `GET /health`

Checks Turso and Redis in parallel. On success:

```json
{
  "status": "ok",
  "checks": { "database": "ok", "redis": "ok" }
}
```

If either dependency is unavailable, the endpoint returns HTTP 503 and marks
the failed check unavailable.

### `GET /draws/current`

Returns the highest-numbered draw in one of the active statuses:
`OPEN`, `CLOSING`, `CLOSED`, `DRAWING`, `RESULT_READY`, or
`SETTLEMENT_PENDING`. When none exists, returns HTTP 200 with a JSON `null`
body; the API never creates a draw on the frontend's behalf.

```json
{
  "id": "draw-uuid",
  "drawNumber": 1,
  "status": "OPEN",
  "openAt": "2026-10-09T15:00:00.000Z",
  "closeAt": "2026-10-09T15:04:00.000Z",
  "drawAt": "2026-10-09T15:04:30.000Z",
  "resultAt": null,
  "balls": [],
  "statistics": null,
  "latestResult": null
}
```

When results exist, `balls` contains `{ number, color, orderIndex }` objects.
`statistics` is either `null` or `{ totalSum, has49, majorityColor }`.
`latestResult` is the latest six-ball result and can belong to a completed
previous draw; it is `null` before the first result exists.
Persisted `Date` values are returned as ISO strings. Do not infer that an empty
`balls` array means there is no result; use `latestResult.balls` for the result
currently shown in the frontend.

### `GET /draws/results`

Returns recent completed results and statistics for the Lucky6 TV results
board. `limit` is optional (default `10`, maximum `50`); aggregate statistics
use up to the latest 20 completed draws. Each result contains its six balls,
sum, and winning colour (`RED`, `BLUE`, `GREEN`, or `DRAW` for a tie).

The statistics include the five most frequent numbers, the five most delayed
numbers, the maximum delay in draw numbers, winning-colour counts, and the
sum-band counts. Lucky6 sum bands are `LOW` 21–120, `MID` 121–170, and `HIGH`
171–279. Delay is the difference between the latest completed draw number and
the number's last completed draw number.

### `GET /markets`

Returns active markets and their selections. Each selection includes
`id`, `value`, `label`, `currentOdds`, `oddsVersion`, `minStake`, and
`maxStake`. `maxStake` is constrained by the minimum 10-credit stake, the
wallet balance, and the 1,000,000-credit gross-payout cap; zero means the
selection cannot be placed even at a one-credit stake. Markets include the same
global limits. Odds are JSON numbers. Treat this response as the market board
source of truth; do not hardcode IDs or prices.

```json
[
  {
    "id": "market-uuid",
    "type": "FIRST_BALL_COLOR",
    "title": "First Ball Color",
    "description": "Predict the color of the first drawn ball.",
    "minStake": "10",
    "maxStake": "999999",
    "maxGrossPayout": "1000000",
    "selections": [
      {
        "id": "selection-uuid",
        "value": "BLUE",
        "label": "Blue (1–12)",
        "currentOdds": 2.76,
        "oddsVersion": 1,
        "minStake": "10",
        "maxStake": "999999"
      }
    ]
  }
]
```

`PICK_NUMBERS_APPEAR` and `PICK_NUMBERS_ABSENT` markets contain selections
whose `value` is `<pick-count>:<includes-49-flag>` (for example `3:0` or
`3:1`). This gives the exact model-based quote for the set size and whether it
includes 49. The actual ticket numbers are still sent separately and the API
validates that the selection matches the ticket.

### `POST /bets`

The endpoint requires a valid HTTP-only wallet session. Normal selection bet:

```json
{
  "drawId": "draw-uuid",
  "selectionId": "selection-uuid",
  "kind": "SELECTION",
  "stake": 10,
  "idempotencyKey": "unique-client-generated-uuid",
  "oddsVersion": 1
}
```

Lucky Six and Bet Zero ticket:

```json
{
  "drawId": "draw-uuid",
  "kind": "PICK_NUMBERS",
  "marketType": "PICK_NUMBERS_APPEAR",
  "selectionId": "selection-uuid",
  "oddsVersion": 1,
  "numbers": [7, 18, 49],
  "stake": 10,
  "idempotencyKey": "unique-client-generated-uuid"
}
```

`marketType` is `PICK_NUMBERS_APPEAR` (all picked numbers must appear) or
`PICK_NUMBERS_ABSENT` (all picked numbers must be absent). Pick 1–6 unique
numbers in the range 1–49. Any partial match loses. For ordinary selections,
send `kind: "SELECTION"` and omit `marketType` and `numbers`.

The server derives the wallet from the session; never send a `walletId`.
`stake` is a positive whole-number credit amount with a minimum of 10. The
server checks the open draw, active selection and odds version, wallet balance,
and gross payout limit in one transaction. Each Rainbow selection uses its own
`SELECTION` request and idempotency key; never combine or multiply its odds.
Re-use the same idempotency key for retries of the same request.

The UI must preserve the failed wager for review/retry, but clear selected
wagers when the player switches games. A stale-odds conflict requires fetching
the updated market quote and explicit user reconfirmation.

### `GET /wallet/me`

Returns:

```json
{
  "walletId": "wallet-uuid",
  "address": "base58-solana-public-key",
  "balance": "1000"
}
```

Wallet balances and stakes are Prisma `BigInt` values stored by SQLite/libSQL as
decimal strings. Keep them as strings or parse with `BigInt` for exact
arithmetic; do not assume they are JavaScript-safe integers.

### `GET /wallet/transactions`

Requires the wallet session cookie and returns up to 50 newest ledger entries
for the authenticated wallet. Each entry contains `id`, decimal-string `amount`,
`type`, nullable `reference`, and ISO `createdAt`. The `amount` is signed:
stakes are negative and credits or payouts are positive.

The legacy `GET /wallet/:walletId/balance` route is also session guarded and
returns not found for a wallet other than the authenticated wallet.

### `GET /bets/mine`

Requires the wallet session cookie and returns the wallet's newest accepted and
settled bets, including their draw, selection/ticket details, and settlement
result. The optional `limit` query parameter must be between 1 and 50.

### `POST /auth/nonce` and `POST /auth/verify`

Nonce request:

```json
{ "address": "base58-solana-public-key" }
```

Nonce response:

```json
{
  "nonce": "hex-random-challenge",
  "message": "Sign this message to authenticate with Lucky Six: hex-random-challenge",
  "expiresAt": "2026-10-09T15:05:00.000Z"
}
```

The wallet signs the exact returned `message`. Then post:

```json
{
  "address": "base58-solana-public-key",
  "signature": "wallet-signature",
  "nonce": "hex-random-challenge"
}
```

The server validates the challenge address, one-time use, and five-minute
expiry, verifies an Ed25519 signature, and finds or creates a wallet. New
wallets receive 1000 SIM and a `BONUS_CREDIT` ledger entry. Success returns
`authenticated`, `address`, `walletId`, and string `balance`, and attempts to
set an HTTP-only `session` cookie with a 24-hour expiry.

The bet and balance routes use `SessionGuard`; the wallet comes from the
authenticated session rather than a caller-supplied wallet ID.
`frontend/src/lib/api.ts` sends requests with `credentials: 'include'`.
For cross-origin browser use, the API CORS origin and cookie attributes still
need to match the deployed frontend's host and HTTPS configuration.

## 5. Markets, pricing, and settlement behavior

### Market odds

`backend/src/pricing/pricing-engine.service.ts` computes theoretical
probabilities for several market types and applies:

```text
offered odds = (1 - houseMargin) / adjustedProbability
```

The default house margin is 8%; the minimum offered price is 1.01 and values
are rounded to two decimal places. An optional exposure adjustment is accepted
by the calculation helper, but the current update path does not pass one.
`PricingConfig.exposureFactor` is stored in the schema but isn't used in this
path. The service versions odds in Turso and marks the previous version
inactive when the value changes. Bets lock the active odds when accepted.

The API currently reads and returns odds; no public endpoint was found for
requesting an odds refresh. The backend recalculates odds once at API startup;
it does not currently recalculate automatically each time the engine opens a
draw.

The pricing model now uses three equal groups of 16 numbers for color
probabilities, and blends the five-normal-ball jackpot branch with the
six-normal-ball branch. For `FIRST_BALL_COLOR`, black's first-position chance
is the configured jackpot probability divided by six. Unsupported color
selections (such as the former `YELLOW` option) have their odds deactivated and
are omitted from `GET /markets`.

### Selections settlement evaluates

`settlement/src/domain/settlement-evaluator.service.ts` currently evaluates:

| Market type | Winning condition |
| --- | --- |
| `INDIVIDUAL_NUMBER` | The selected numeric value is among the six balls |
| `BLACK_JACKPOT` | `YES` if ball 49 appeared; `NO` otherwise |
| `COLOR_MAJORITY` | Selected color equals `majorityColor`; `NO_MAJORITY` wins when it is `null` |
| `SUM_HIGH_MID_LOW` | `LOW` is sum 15–120; `MID` is 121–170; `HIGH` is 171–280 |
| `SUM_ODD_EVEN` | Total sum has the selected parity |
| `FIRST_BALL_COLOR` | The ball with `orderIndex === 0` has the selected color |

Unrecognized types/values lose (return `false`). The current evaluator also supports `SUM_OVER_UNDER` and `COLOR_COUNT`.
`PICK_NUMBERS_APPEAR` and `PICK_NUMBERS_ABSENT` are evaluated through the
number-pick ticket path; all picks must respectively appear or be absent.
`PICK_SIX` remains supported only for previously accepted tier tickets.
`TOTAL_SUM` and `LAST_BALL_COLOR` are not currently evaluated.

### Settlement and payout

`settlement/src/settlement.service.ts` subscribes to `draw.completed` and
polls every five seconds for draws in `RESULT_READY` or `SETTLEMENT_PENDING`.
For each accepted bet:

1. It rechecks that the bet is still `ACCEPTED` and has no settlement.
2. A normal selection bet contains exactly one selection. Number-pick and
   legacy Pick Six tickets use their persisted ticket rules.
3. A winning payout is `floor(stake × locked odds)` for a single-selection or
   number-pick ticket. The legacy Pick Six ticket uses its locked tier
   multiplier. The wallet is credited and a `BET_WIN` ledger entry is written.
4. A losing bet gets `LOST` status and a zero-payout settlement record.
5. The draw is marked `SETTLED` after its accepted bets have been processed.

The transaction and unique settlement-per-bet constraint provide a degree of
idempotency for retries. The in-process `isSettling` flag is not a distributed
lock if multiple settlement processes are run.

### Deployment status

The new number-pick markets and `PickNumberTicket` table are code changes until
their migration is applied and the backend is deployed. The production API
must expose both number-pick markets before the updated frontend can place
those bets. Follow `docs/DEVELOPMENT_HANDOFF.md`; do not treat a frontend build
or a successful health check as proof that the database schema is migrated.

## 6. Realtime events

The backend Socket.IO gateway subscribes to Redis channel `lucky-six:events`
and broadcasts each Redis event name to connected Socket.IO clients. It does
not add a room/user filter; events are broadcast globally.

Events published by the current workers include:

| Event | Published by | Current payload |
| --- | --- | --- |
| `draw.created` | Engine | `{ drawId, drawNumber, openAt, closeAt, drawAt }` |
| `draw.open` | Engine | `{ drawId, drawNumber }` |
| `draw.closed` | Engine | `{ drawId, drawNumber }` |
| `draw.started` | Engine | `{ drawId, drawNumber }` |
| `ball.drawn` | Engine | `{ drawId, drawNumber, ball: { number, color, orderIndex } }` |
| `draw.completed` | Engine | `{ drawId, drawNumber, completedAt, balls, statistics }` |
| `settlement.completed` | Settlement | `{ drawId, drawNumber, settledBetsCount, totalPayout, completedAt }` |
| `wallet.updated` | Payment worker | `{ walletId, creditsAdded }` |

The shared `RealtimeEvent` union is out of sync with emitted names: it declares
`draw.result` but not `draw.completed` or `ball.drawn`. It also declares events
such as `odds.updated` and `jackpot.updated` that these workers do not currently
publish. Keep client event types based on actual publisher payloads until the
shared contract is reconciled.

Recommended frontend behavior:

- Fetch the current draw and markets on page load.
- Use Socket.IO for timely draw/reveal/settlement updates if desired.
- Treat the socket as an update signal, not a durable event log: reconnect by
  fetching the current API state again.
- Poll/refetch as a fallback, and deduplicate reveals using
  `(drawId, orderIndex)`.
- Refetch authoritative draw/market/balance state after important events.

## 7. Frontend integration patterns

### API base URL and shared fetch helper

`frontend/src/lib/api.ts` reads `NEXT_PUBLIC_API_URL`, defaulting to
`https://luckyapi.muizdev.xyz`, so local and deployed frontends use the
production API unless explicitly overridden. Use:

```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=https://luckyapi.muizdev.xyz
```

Restart the frontend after changing this value. Set
`NEXT_PUBLIC_API_URL=http://localhost:4000` only when intentionally testing
against a backend running on the developer machine. The draw-board Socket.IO
connection uses the same base URL as the HTTP API.

`fetchJson<T>` joins the base URL and endpoint, sends JSON content type, throws
on non-2xx responses, and parses the JSON body. Existing helpers cover current
draw, markets, bet placement, and wallet nonce/signature authentication.

Example TanStack Query usage (the root layout must wrap the app in the existing
`Providers` component before using `useQuery`):

```tsx
'use client';

import { useQuery } from '@tanstack/react-query';
import { getCurrentDraw, getMarkets } from '@/lib/api';

export function GameData() {
  const draw = useQuery({
    queryKey: ['current-draw'],
    queryFn: ({ signal }) => getCurrentDraw(signal),
    refetchInterval: 15_000,
  });
  const markets = useQuery({
    queryKey: ['markets'],
    queryFn: ({ signal }) => getMarkets(signal),
    refetchInterval: 60_000,
  });

  // Render pending/error states; do not invent results or odds.
  return null;
}
```

Use the server's `closeAt` to derive a countdown; update the displayed clock
locally, but keep the server's `status` and timestamps authoritative. A
`SETTLEMENT_PENDING` draw already has results to display even though bet
settlement may still be running.

### Bet submission

The current helper accepts:

```ts
placeBet({
  walletId,
  drawId,
  selectionId,
  stake: '10',
  idempotencyKey,
});
```

Use IDs from the latest balance/auth, draw, and market responses. Lock the UI
while a submission is pending; retain one idempotency key for retries of the
same bet. Display server errors and then refetch balance/draw as appropriate.
Do not subtract stake optimistically as the final truth.

### Local UI state vs server state

The existing Zustand store (`frontend/src/store/ui/useUiStore.tsx`) is for
temporary UI state such as selected bet, stake input, sound preference, and
modal visibility. It is not persistent, authoritative account state. Use
TanStack Query for API-owned draw, market, and balance data. Current root
`layout.tsx` does not wrap children with `Providers`; it must do so before
components rely on the QueryClient, MUI theme, or UI store.

## 8. Payment capability: worker exists, public flow does not

The database includes `PaymentOrder` and `PaymentTransaction`, and the
payment worker polls pending orders, verifies finalized Solana transactions
against the configured treasury address, and credits SIM with a
`CREDIT_PURCHASE` ledger entry.

However, no HTTP controller currently creates a payment order or attaches a
submitted transaction signature. `SolanaPaymentService.quotePaymentPackage()`
exists, but there is no public route using it. The worker cannot complete a
normal frontend-initiated purchase flow without those API operations. The
frontend should not claim that buying SIM is available through this API yet.

Other current implementation details:

- Quote math values 1 SIM at USD $0.01 and converts package cost using the SOL
  price.
- The Solana service caches CoinGecko SOL/USD prices for one minute and allows
  a cache up to three minutes old; on fetch failure it falls back to the
  cached price or a static $150.
- On-chain transaction verification checks finalized status and the
  treasury-account SOL balance delta.
- Exact payment and overpayment credit the order's configured
  `creditsToIssue`; overpayment does not issue extra credits.
- The payment worker marks expired pending orders and polls orders in
  `PENDING`, `SUBMITTED`, or `CONFIRMING`.
- A mock price oracle service is registered but is not used by the payment
  worker's current verification loop.

## 9. Data model essentials

The Prisma schema is in `backend/prisma/schema.prisma`.

- `Draw` owns ordered `DrawBall` results and one `DrawStatistic`.
- `Market` owns `MarketSelection` rows; each selection has versioned
  `MarketOdds`.
- `Bet` links one wallet and draw to one or more `BetSelection` rows. Each
  bet-selection stores the odds locked when the bet was accepted.
- `Wallet.balance` and ledger amounts are `BigInt`. The ledger is an audit
  trail; the wallet balance is the current balance field.
- `Settlement` is unique per bet and stores status and payout.
- `AuthChallenge` and `WalletSession` store signature-login challenges and
  session-token hashes.
- Payment orders and transactions are modeled behind session-protected
  `/payments` routes; wallet ledger entries are available through
  `GET /wallet/transactions`.

For presentation, convert BigInt strings without loss. For monetary values,
display SIM units according to product decisions; the API currently exposes
integer SIM credits, not fractional SIM.

## 10. Current API surface and not-yet-available frontend features

| Frontend feature | Current support |
| --- | --- |
| Current draw and results | `GET /draws/current` |
| Active market list and current odds | `GET /markets` |
| Wallet-signature nonce and verification | `POST /auth/nonce`, `POST /auth/verify` |
| Wallet balance read | `GET /wallet/:walletId/balance` |
| Bet placement | `POST /bets` |
| Health | `GET /health` |
| Live broadcast | Socket.IO events bridged from Redis |
| Draw history | No HTTP route found |
| Bet history | `GET /bets/mine` |
| Wallet transaction history | `GET /wallet/transactions` |
| Payment quote/order/signature submission | `GET /payments/quote`, `POST /payments/orders`, `POST /payments/orders/:orderId/submit` |
| Odds refresh/admin configuration | No HTTP route found |
| Session-protected wallet/bet API authorization | Enforced by `SessionGuard` |

## 11. Additional issues found during code review

These are implementation gaps, not behavior the frontend should work around.
The highest-priority items should be resolved before real-money or
production-facing wagering is enabled.

| Priority | Finding | Frontend/backend consequence | Recommended direction |
| --- | --- | --- | --- |
| Critical | Bet placement and balance reads accept a caller-supplied `walletId` without validating the session cookie or wallet ownership. | A caller who obtains another wallet ID can read its balance and attempt bets against it. | Add a session guard, resolve the wallet from the authenticated session, and remove caller authority over `walletId`. |
| Critical | `AuthController.verify()` accepts any signature starting with `TEST_SIGNATURE_`, regardless of `NODE_ENV`. | The authentication check can be bypassed by submitting that prefix with a valid nonce/address. | Remove the bypass from production builds or make it impossible to enable in production; keep tests using an injected verifier/mock. |
| High | Balance validation reads the wallet, then decrements it inside a transaction without a conditional balance predicate or row lock. | Concurrent bets can both pass the same balance check and collectively debit more than the balance. | Use an atomic conditional decrement (`balance >= stake`) and require exactly one updated row before creating the bet. |
| High | Draw results use `Math.random()` and store no independent proof or seed. | Users cannot independently verify draw fairness; this may be unsuitable for a wagering product. | Define fairness requirements and use an auditable randomness design before accepting real-value stakes. |
| High | The generator uses `Math.random()` and stores no independent proof or seed. | Users cannot independently verify draw fairness; this may be unsuitable for a wagering product. | Define the fairness requirements and use an auditable randomness design before accepting real-value stakes. |
| High | The seeded `SUM_OVER_UNDER` market is not handled by settlement; unknown market types evaluate as losses. | Those selections lose regardless of the result. | Align seeded market types, shared contracts, pricing probabilities, and evaluator cases; disable unsupported markets until tested. |
| High | Odds are recalculated at API startup, but not when the engine opens a new draw; the previous read fallback was not a reliable lifecycle trigger. | Pricing changes/configuration updates may not be reflected until the API restarts. | Give odds refresh an explicit backend-owned draw-open trigger, separate from HTTP reads, and version the odds used for each round. |
| Medium | `GET /markets` substitutes odds `2.0` and version `1` when no active odds row exists, while bet placement rejects that same selection. | The frontend can display a price that the bet endpoint cannot accept. | Omit/disable selections without active odds or fail the market response explicitly; do not invent a price. |
| Medium | Stake accepts arbitrary strings and positive fractional numbers, then converts with `BigInt()`. | A value such as `"1.5"` passes schema validation but throws during conversion; large JSON numbers may already have lost precision. | Validate integer strings and send them as strings; map invalid stakes to HTTP 400. |
| Medium | Settlement converts `BigInt` stake to `Number` before calculating payout. | Large stakes can lose precision before payout is floored back to `BigInt`. | Use decimal/integer-safe payout arithmetic and impose explicit stake/odds bounds. |
| Medium | The realtime gateway broadcasts events globally; `wallet.updated` includes wallet ID and added-credit amount. | Connected clients receive wallet update metadata for other users. | Authorize sockets and emit wallet-private events only to the authenticated wallet's room. |
| Medium | Payment verification performs Solana RPC work inside a database transaction and publishes `wallet.updated` before that transaction commits. | Slow RPC can hold a transaction open; a client can receive an update before the credited balance is committed. | Verify externally before opening the write transaction, then commit wallet/order/ledger atomically and publish after commit (prefer a transactional outbox). |
| Medium | The auth verifier marks a challenge used before verifying the signature. | A malformed or invalid signature consumes the challenge and forces a fresh wallet prompt. | Verify first, then consume with an atomic conditional update to prevent replay races. |
| Medium | The session cookie is `SameSite=Lax`, while the Vercel frontend and API are cross-site for browser fetches; the fetch helper also omits `credentials: 'include'`. | The browser will not reliably send the session cookie on frontend API requests, even after CORS is enabled. | Decide on cookie vs bearer-token auth, then align cookie SameSite/Secure settings, CORS credentials, and client fetch credentials. |
| Low | Shared event names/payload interfaces differ from actual Redis/Socket.IO publications. | A typed frontend may listen for a declared event the server never emits. | Generate/validate publishers and consumers against the same event contracts. |

The read-only `GET /draws/current` fix removes the most urgent engine/API
ownership violation. It does not resolve the separate authentication,
settlement, randomness, and odds-refresh issues in this table.

## 12. Integration checklist before presenting wagering as live

1. Decide which market types are actually supported and reconcile the seed,
   probability engine, evaluator, contracts, and market API output.
2. Add tests for all winning/losing rules and range boundaries; current tests
   cover only ball-color mapping, uniqueness, total sum, and jackpot inclusion.
3. Decide the supported wallet session model and enforce authorization for
   balance and bet requests.
4. Confirm idempotency behavior and request/response types in shared contracts.
5. Add payment HTTP endpoints before exposing a frontend purchase flow.
6. Align real-time event names/payloads with `packages/contracts`.
7. Wrap the Next.js root layout in `Providers` before using TanStack Query,
   Zustand UI store, or the MUI theme.
8. Test API behavior from both the deployed Vercel origin and
   `http://localhost:3000`; CORS must allow the exact origin.

## 13. Source map

- API bootstrap, CORS, and Helmet: `backend/src/main.ts`
- Module composition: `backend/src/app.module.ts`
- Game and wallet HTTP routes: `backend/src/game/game.controller.ts`
- Wallet challenge/signature flow: `backend/src/auth/auth.controller.ts`
- Market pricing: `backend/src/pricing/pricing-engine.service.ts`
- Socket.IO/Redis bridge: `backend/src/realtime/realtime.gateway.ts`
- Data model: `backend/prisma/schema.prisma`
- Seeded markets and odds: `backend/prisma/seed.ts`
- Draw rules: `engine/src/domain/draw/mathematics.ts`
- Draw scheduler: `engine/src/draw-scheduler.service.ts`
- Settlement rules: `settlement/src/domain/settlement-evaluator.service.ts`
- Settlement worker: `settlement/src/settlement.service.ts`
- Solana verification and quote math: `payment-worker/src/domain/solana-payment.service.ts`
- Payment polling and credits: `payment-worker/src/payment-worker.service.ts`
- Shared declared API/event types: `packages/contracts/src/index.ts`
- Frontend API fetch wrapper: `frontend/src/lib/api.ts`
- Frontend query and UI providers: `frontend/src/providers/Providers.tsx`
- Frontend temporary UI store: `frontend/src/store/ui/useUiStore.tsx`
- Frontend deployment setup: `docs/DEVELOPMENT_HANDOFF.md`
