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

PostgreSQL is authoritative for draws, wallets, bets, odds, payment records, and
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
  Draw numbers start at 10001 if there is no earlier draw.
- A new draw is open for four minutes. `drawAt` is 30 seconds after `closeAt`,
  leaving a closed interval before results are generated.
- The engine writes each result ball and the statistics to PostgreSQL, sets
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
API returns HTTP 404 with `No active draw is currently available.` It does not
create a draw; creation and lifecycle transitions belong to the engine.

For the one-time pre-launch test-data reset, stop all four PM2 services, apply
pending migrations, then run
`npm run db:reset-draw-data --workspace=backend -- --confirm-reset-draw-data --services-stopped`.
The guarded command deletes draw rows and their balls, statistics, bets,
selections, and settlements. It deliberately preserves wallets, balances,
payment records, and ledger entries. The engine then starts at draw 10001.

The engine processes the oldest unfinished draw before moving to a newer one.
Draw creation is serialized with a PostgreSQL advisory transaction lock so two
engine instances cannot both create the next open draw. Result balls,
statistics, and the transition to `SETTLEMENT_PENDING` are committed together;
an interrupted `DRAWING` state is retried on the next scheduler tick.

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

Checks PostgreSQL and Redis in parallel. On success:

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
`SETTLEMENT_PENDING`. When none exists, returns HTTP 404; the API never creates
a draw on the frontend's behalf.

```json
{
  "id": "draw-uuid",
  "drawNumber": 10001,
  "status": "OPEN",
  "openAt": "2026-10-09T15:00:00.000Z",
  "closeAt": "2026-10-09T15:04:00.000Z",
  "drawAt": "2026-10-09T15:04:30.000Z",
  "resultAt": null,
  "balls": [],
  "statistics": null,
  "latestResult": {
    "id": "previous-draw-uuid",
    "drawNumber": 10000,
    "resultAt": "2026-10-09T15:04:35.000Z",
    "balls": [
      { "number": 3, "color": "GREEN", "orderIndex": 0 },
      { "number": 14, "color": "BLUE", "orderIndex": 1 },
      { "number": 25, "color": "BLUE", "orderIndex": 2 },
      { "number": 32, "color": "BLUE", "orderIndex": 3 },
      { "number": 41, "color": "BLUE", "orderIndex": 4 },
      { "number": 48, "color": "GREEN", "orderIndex": 5 }
    ],
    "statistics": {
      "totalSum": 163,
      "has49": false,
      "majorityColor": "BLUE"
    }
  }
}
```

When results exist, `balls` contains `{ number, color, orderIndex }` objects.
`statistics` is either `null` or `{ totalSum, has49, majorityColor }`.
`latestResult` is the latest six-ball result and can belong to a completed
previous draw; it is `null` before the first result exists.
Persisted `Date` values are returned as ISO strings. Do not infer that an empty
`balls` array means there is no result; use `latestResult.balls` for the result
currently shown in the frontend.

### `GET /markets`

Returns active markets and their selections. Each selection includes
`id`, `value`, `label`, `currentOdds`, and `oddsVersion`. Odds are converted to
JSON numbers by the API. Treat this response as the market board source of
truth; avoid hardcoding IDs or odds in the UI.

```json
[
  {
    "id": "market-uuid",
    "type": "FIRST_BALL_COLOR",
    "title": "First Ball Color",
    "description": "Predict the color of the first drawn ball.",
    "selections": [
      {
        "id": "selection-uuid",
        "value": "BLUE",
        "label": "Blue (1–12)",
        "currentOdds": 4,
        "oddsVersion": 1
      }
    ]
  }
]
```

The API's response currently omits `active` on the market and `marketId` on
each selection, although the shared `MarketDto` interfaces include those
fields. Prefer the actual HTTP response until the implementation and DTO are
reconciled.

### `POST /bets`

Request body as validated by the current controller:

```json
{
  "walletId": "wallet-uuid",
  "drawId": "draw-uuid",
  "selectionId": "selection-uuid",
  "stake": "10",
  "idempotencyKey": "unique-client-generated-key"
}
```

- `walletId`, `drawId`, and `selectionId` must be UUIDs.
- `stake` accepts a positive number or string, but it is converted to `BigInt`.
  Send a whole-number string such as `"10"`; decimal values are not SIM
  fractions and may fail during conversion.
- `idempotencyKey` is optional. If provided, it is unique per wallet. Reuse the
  same key when retrying the same request; do not generate a new key for a
  network retry.
- The server transaction checks that the draw exists, is `OPEN`, and has not
  reached `closeAt`; checks the wallet and balance; loads the selection's
  active odds; debits the stake; creates a `BET_STAKE` ledger entry when a
  ledger account exists; and creates the bet with the odds locked at request
  time.
- A normal response contains the bet ID, wallet ID, draw ID, stake as a string,
  status, creation timestamp, and locked selection odds.
- An idempotent replay returns the existing bet's ID, status, stake, and key.
  The replay response is therefore smaller than the first response.
- Betting can fail with validation, not-found, closed-draw, or insufficient
  balance errors. Keep the UI selection and entered stake visible so the user
  can understand or retry an error.

The actual endpoint requires `walletId`; the shared `PlaceBetDto` interface
does not include it. Use the controller's payload until that mismatch is fixed.

### `GET /wallet/:walletId/balance`

Returns:

```json
{ "walletId": "wallet-uuid", "balance": "1000" }
```

Wallet balances and stakes are PostgreSQL `BigInt` values, serialized as
decimal strings. Keep them as strings or parse with `BigInt` for exact
arithmetic; do not assume they are JavaScript-safe integers.

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

Current integration limitations:

- The bet and balance controllers do not validate that the caller owns the
  supplied wallet ID or require the session cookie.
- The frontend `fetchJson` helper does not set `credentials: 'include'`.
- For a cross-site Vercel frontend/API cookie session, CORS, cookie
  `SameSite`/`Secure` attributes, and frontend credentials must be aligned.
- The challenge is marked used before the signature is verified. An invalid
  verification attempt consumes that nonce.
- The verifier accepts signatures in hex, base64, or base58; wallet SDK output
  may need explicit encoding before sending.

Authentication should not be presented as a complete protected-account
system until these integration gaps are addressed.

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
path. The service versions odds in PostgreSQL and marks the previous version
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

Unrecognized types/values lose (return `false`). In particular, despite the
type names in the shared contracts, no evaluator case currently handles
`COLOR_COUNT`, `TOTAL_SUM`, or `LAST_BALL_COLOR`.

### Settlement and payout

`settlement/src/settlement.service.ts` subscribes to `draw.completed` and
polls every five seconds for draws in `RESULT_READY` or `SETTLEMENT_PENDING`.
For each accepted bet:

1. It rechecks that the bet is still `ACCEPTED` and has no settlement.
2. Every selection on that bet must win; odds are multiplied together.
3. A winning payout is `floor(stake × product(locked odds))`. The wallet is
   credited and a `BET_WIN` ledger entry is written.
4. A losing bet gets `LOST` status and a zero-payout settlement record.
5. The draw is marked `SETTLED` after its accepted bets have been processed.

The transaction and unique settlement-per-bet constraint provide a degree of
idempotency for retries. The in-process `isSettling` flag is not a distributed
lock if multiple settlement processes are run.

### Important seeded-market mismatch

`backend/prisma/seed.ts` currently seeds `FIRST_BALL_COLOR` and
`SUM_OVER_UNDER`, including `OVER`/`UNDER` selections at 122.5. The settlement
evaluator has no `SUM_OVER_UNDER` case, so those seeded over/under selections
currently lose regardless of the draw. The shared `MarketType` union also
does not declare `SUM_OVER_UNDER`. The seed's comments/initial odds and the
pricing service's theoretical probabilities are not a substitute for runtime
settlement rules.

Before enabling real betting UI for a market, align its seeded type, shared
contract type, probability logic, and settlement evaluation, then cover the
winning boundaries with tests.

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
`http://localhost:4000`. Use:

```env
# frontend/.env.local
NEXT_PUBLIC_API_URL=https://luckyapi.muizdev.xyz
```

Restart `next dev` after changing this value. The local API URL is appropriate
only when the backend is running on the developer machine.

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
- Payment orders and transactions are modeled but currently lack public API
  routes.

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
| Bet history | No HTTP route found |
| Payment quote/order/signature submission | No HTTP route found |
| Odds refresh/admin configuration | No HTTP route found |
| Session-protected wallet/bet API authorization | Not enforced by these controllers |

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
