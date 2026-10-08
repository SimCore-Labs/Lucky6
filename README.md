Bro, I researched the current official docs before laying this out. A few things have changed since the older Solana/Next.js patterns you may have used before:

* **Next.js 16** is current, with Node 20.9+ minimum, and Turbopack is now the default. ([Next.js][1])
* For a new Solana frontend, Solana now recommends **`@solana/kit` + `@solana/react`**, with `@solana/kit-plugin-wallet`, rather than starting a new project around the older `@solana/web3.js`/wallet-adapter stack. Wallet Adapter is still supported, but Kit is the current recommended direction. ([Solana][2])
* **TanStack Query v5** is current and is a very good fit for Lucky Six's constantly changing draw/market/balance data. ([TanStack][3])
* Nest's current queue integration recommends **BullMQ**, not the older Bull package. ([NestJS Documentation][4])
* Nest currently supports Fastify, and its docs describe Fastify as the higher-performance alternative to Express. ([NestJS Documentation][5])
* Prisma 7 is the stable ORM line worth targeting; Prisma 8 is currently a release candidate, so I would **not** use the RC for this project. ([Prisma][6])
* Next.js has native PWA manifest support now, so we don't need to immediately throw a random PWA package into the project. ([Next.js][7])

I've structured the plan into **three documents**: frontend, backend/services, and repository/infrastructure. These are written so you can hand them directly to your developer.

# Lucky Six — Frontend Setup & Architecture

## 1. Project Overview

Lucky Six is a Web3-first, real-time 5-minute draw game.

The frontend is a Next.js App Router application responsible for:

* displaying the current and upcoming draw
* displaying the six drawn balls
* displaying live countdowns
* displaying available betting markets
* allowing users to place bets
* displaying wallet balance / SIM Credits
* connecting Solana wallets
* authenticating users through wallet signatures
* initiating SOL payments for SIM Credits
* displaying bet history
* displaying draw history
* displaying statistics
* displaying jackpot information
* displaying real-time draw/market/settlement updates

The frontend must NEVER be the authority for:

* draw results
* odds
* bet validity
* user balances
* settlement
* jackpot calculations
* Solana payment verification

Those are backend responsibilities.

---

# 2. Technology Stack

## Core

* Next.js 16+
* React 19+
* TypeScript
* App Router
* MUI
* GSAP

Next.js App Router should be used throughout the project.

Do not create a Pages Router application.

---

# 3. Packages To Install

The developer should install the following.

## Data fetching / server state

```bash
npm install @tanstack/react-query
```

Use TanStack Query for API/server state.

Examples:

* current draw
* upcoming draw
* markets
* odds
* wallet balance
* bet history
* draw history
* statistics
* jackpot
* user profile

Do NOT use Zustand as a replacement for TanStack Query.

TanStack Query owns server state.

---

## Client/UI state

```bash
npm install zustand
```

Use Zustand only for local client state such as:

* selected market
* selected betting slip
* UI preferences
* modal state
* temporary bet slip state
* navigation state
* sound settings
* animation preferences

Do not store authoritative wallet balances or draw results in Zustand.

---

# 4. Forms and Validation

Install:

```bash
npm install react-hook-form zod @hookform/resolvers
```

Use:

* React Hook Form for forms
* Zod for client-side schema validation
* `@hookform/resolvers` to connect them

Zod should also be used on the backend.

Frontend validation is only for user experience.

The backend MUST validate the same data again.

---

# 5. Solana

Use the current Solana Kit architecture.

Install:

```bash
npm install @solana/kit @solana/react @solana/kit-plugin-rpc @solana/kit-plugin-wallet
```

Do NOT install the old Solana stack unless there is a specific compatibility requirement.

Avoid starting with:

```text
@solana/web3.js
@solana/wallet-adapter-wallets
```

Solana's current documentation recommends Kit for new Solana JavaScript applications.

The frontend should support Wallet Standard-compatible wallets.

Initial wallet targets:

* Phantom
* Solflare
* Backpack
* other compatible Solana wallets

The user should be able to:

1. Connect wallet
2. Sign authentication challenge
3. Become authenticated
4. View their Lucky Six account
5. Buy SIM Credits with SOL
6. Sign payment transactions

Connecting a wallet is NOT authentication.

Authentication must use a backend-generated nonce/challenge that the wallet signs.

---

# 6. Real-Time Communication

Install:

```bash
npm install socket.io-client
```

Lucky Six is a real-time application.

The frontend should maintain a Socket.IO connection to the API.

Real-time events can include:

```text
DRAW_CREATED
BETTING_OPEN
BETTING_CLOSING
BETTING_CLOSED
DRAW_STARTED
DRAW_RESULT
MARKETS_UPDATED
ODDS_UPDATED
SETTLEMENT_STARTED
SETTLEMENT_COMPLETED
WALLET_UPDATED
JACKPOT_UPDATED
```

The socket should improve responsiveness but should NOT be the source of truth.

If a socket event is missed, the frontend should be able to refetch authoritative state from the API.

Socket.IO provides reconnection and connection recovery capabilities, which are useful for this application.

---

# 7. Date and Time

Install:

```bash
npm install date-fns
```

All backend timestamps must be UTC.

The frontend converts timestamps to the user's local timezone.

Never calculate the official draw schedule using the browser's local clock.

The server is authoritative.

For countdowns:

```text
server draw time
      ↓
client calculates display countdown
      ↓
periodically synchronize with server
```

Do not trust a user's device clock.

---

# 8. Icons

Because MUI is already being used:

```bash
npm install @mui/icons-material
```

Use MUI Icons consistently.

Do not introduce three different icon libraries.

---

# 9. MUI Next.js Integration

Install:

```bash
npm install @mui/material-nextjs @emotion/cache
```

The MUI App Router cache provider should be configured in the root layout.

The existing MUI installation should remain the primary UI system.

Do not introduce Tailwind just because it is popular.

The project should use:

```text
MUI
+
CSS / sx / styled where appropriate
+
GSAP for animation
```

---

# 10. GSAP

GSAP is already installed.

Also install the official React integration:

```bash
npm install @gsap/react
```

Use GSAP for:

* draw animations
* ball reveal animations
* jackpot animations
* countdown transitions
* market transitions
* page entrance animations
* interactive visual effects

Avoid putting large GSAP animations in every component.

Create reusable animation utilities/components.

---

# 11. Data Visualization

For statistics pages, install:

```bash
npm install recharts
```

Use it for:

* number frequency
* hot/cold numbers
* color frequency
* jackpot history
* user betting statistics
* draw totals
* historical distributions

Do not use charts for information that is better represented as simple cards or tables.

---

# 12. MUI Data Grid

If an advanced statistics/history/admin-style table is required:

```bash
npm install @mui/x-data-grid
```

Use the Community version initially.

Do NOT install Pro or Premium unless we have an actual requirement for a paid feature.

---

# 13. PWA

Do not immediately install a third-party PWA package.

Next.js currently supports:

```text
app/manifest.ts
```

natively.

Start with:

* manifest
* icons
* theme color
* standalone display
* mobile viewport
* installability

A service worker/offline layer can be added later if required.

Lucky Six does not need offline betting.

IMPORTANT:

The application must never allow offline bet placement.

A bet requires an authoritative server response.

---

# 14. API Communication

Use native `fetch()` or a very small internal API client.

Do NOT install Axios unless there is a specific reason.

Create something like:

```text
src/lib/api/
    client.ts
    errors.ts
    draws.ts
    markets.ts
    bets.ts
    wallet.ts
    payments.ts
    auth.ts
```

All API responses should be typed.

---

# 15. Recommended Frontend Structure

```text
frontend/
├── app/
│   ├── layout.tsx
│   ├── page.tsx
│   ├── manifest.ts
│   │
│   ├── play/
│   │   └── page.tsx
│   │
│   ├── draws/
│   │   ├── page.tsx
│   │   └── [drawId]/
│   │       └── page.tsx
│   │
│   ├── history/
│   │   └── page.tsx
│   │
│   ├── statistics/
│   │   └── page.tsx
│   │
│   ├── bets/
│   │   └── page.tsx
│   │
│   ├── wallet/
│   │   └── page.tsx
│   │
│   └── profile/
│       └── page.tsx
│
├── components/
│   ├── layout/
│   ├── navigation/
│   ├── wallet/
│   ├── draw/
│   ├── betting/
│   ├── markets/
│   ├── countdown/
│   ├── jackpot/
│   ├── statistics/
│   └── common/
│
├── providers/
│   ├── QueryProvider.tsx
│   ├── SolanaProvider.tsx
│   ├── SocketProvider.tsx
│   └── AppProviders.tsx
│
├── hooks/
│   ├── useCurrentDraw.ts
│   ├── useMarkets.ts
│   ├── useWalletBalance.ts
│   ├── useBetSlip.ts
│   └── useRealtimeEvents.ts
│
├── lib/
│   ├── api/
│   ├── solana/
│   ├── socket/
│   ├── animations/
│   ├── formatting/
│   └── validation/
│
├── store/
│   └── ui/
│
├── theme/
│   ├── theme.ts
│   └── palette.ts
│
├── types/
│   ├── draw.ts
│   ├── market.ts
│   ├── bet.ts
│   └── wallet.ts
│
└── public/
    ├── icons/
    └── assets/
```

---

# 16. Important Frontend Rules

### Rule 1

Never calculate official results in the frontend.

### Rule 2

Never calculate authoritative odds in the frontend.

### Rule 3

Never trust a frontend balance.

### Rule 4

Never put Solana treasury private keys in the frontend.

### Rule 5

Never consider wallet connection alone to be authentication.

### Rule 6

Never allow a bet to be considered successful until the backend confirms it.

### Rule 7

The frontend can display a countdown, but the backend controls betting cutoff.

### Rule 8

The frontend can display an optimistic UI state, but money-related state must be reconciled with the backend.

---

# 17. Initial Frontend Installation

Since Next.js, MUI and GSAP are already installed, install:

```bash
npm install \
  @mui/material-nextjs \
  @emotion/cache \
  @mui/icons-material \
  @tanstack/react-query \
  zustand \
  react-hook-form \
  zod \
  @hookform/resolvers \
  @solana/kit \
  @solana/react \
  @solana/kit-plugin-rpc \
  @solana/kit-plugin-wallet \
  socket.io-client \
  date-fns \
  recharts \
  @gsap/react
```

Optional:

```bash
npm install @mui/x-data-grid
```

Only install Data Grid if the UI actually needs it.

---

# 18. Testing

Use:

```bash
npm install -D vitest @testing-library/react @testing-library/jest-dom
```

For browser/end-to-end testing:

```bash
npm install -D @playwright/test
```

Test at minimum:

* wallet connection UI
* authentication flow
* draw countdown
* market display
* bet slip
* invalid stake handling
* insufficient balance
* payment flow UI
* reconnect behavior
* real-time event handling

---

# 19. Performance

Next.js automatically performs code splitting and tree shaking.

Use dynamic imports for heavy client-only components when appropriate.

Especially consider lazy loading:

* charts
* large statistics screens
* complex GSAP experiences
* wallet UI
* admin components

Do not load the entire application into the initial JavaScript bundle.

A bundle analyzer can be added later if bundle size becomes a concern.

---

# 20. Final Frontend Goal

The frontend should feel like a polished real-time Web3 game/sportsbook interface.

The user flow should be:

```text
Open Lucky Six
      ↓
Connect Wallet
      ↓
Sign Authentication Message
      ↓
Authenticated
      ↓
View Current Draw
      ↓
View Markets + Odds
      ↓
Select Market
      ↓
Enter Stake
      ↓
Confirm Bet
      ↓
Backend Accepts Bet
      ↓
Watch Countdown
      ↓
Draw Happens
      ↓
Result Revealed
      ↓
Settlement
      ↓
Balance Updated
```

The frontend is a presentation and interaction layer.

The backend remains authoritative.

# Lucky Six — Backend & Service Architecture

## 1. Backend Philosophy

Lucky Six should NOT be implemented as one giant backend process.

The system should be divided into independent logical services with clear responsibilities.

The most important separation is:

```text
API / Betting
        ≠
Draw Engine
        ≠
Settlement Engine
        ≠
Solana Payment Verification
```

They can initially run on the same EC2 machine, but they must remain separate processes/containers.

This gives us the ability to scale or move them independently later.

---

# 2. Recommended Backend Stack

## Runtime

Node.js 22+ / current active LTS.

## Language

TypeScript.

Use strict TypeScript.

## HTTP framework

NestJS.

## HTTP adapter

Fastify.

Recommended packages:

```bash
npm install @nestjs/platform-fastify fastify
```

NestJS provides the application structure while Fastify provides the HTTP server.

---

# 3. Core Backend Packages

Install:

```bash
npm install \
  @nestjs/common \
  @nestjs/core \
  @nestjs/config \
  @nestjs/platform-fastify \
  fastify \
  @fastify/cors \
  @fastify/cookie \
  @fastify/helmet
```

Use environment-based configuration.

Never hardcode:

* database credentials
* Redis credentials
* JWT secrets
* Solana RPC URLs
* treasury wallet addresses
* API keys

---

# 4. Database

Use:

**PostgreSQL**

Use:

**Prisma ORM**

Target the stable Prisma ORM 7 line rather than the Prisma 8 release candidate.

Install:

```bash
npm install @prisma/client
npm install -D prisma
```

Initialize:

```bash
npx prisma init
```

PostgreSQL is the source of truth for:

* users
* wallets
* balances
* ledger entries
* draws
* balls
* markets
* odds snapshots
* bets
* settlements
* payment orders
* Solana transaction records
* audit records

Redis must NOT be the source of truth for money.

---

# 5. Database Principle

For anything involving money/credits:

```text
PostgreSQL
    ↓
transaction
    ↓
ledger
    ↓
balance
```

Never:

```text
Redis
    ↓
balance
```

Redis is a performance/infrastructure layer.

PostgreSQL is authoritative.

---

# 6. Redis

Use Redis for:

* caching
* distributed locks
* queues
* temporary state
* rate-limit storage
* real-time coordination

Use:

```bash
npm install ioredis
```

For Nest cache abstraction:

```bash
npm install @nestjs/cache-manager cache-manager @keyv/redis
```

Do not put authoritative financial records in Redis.

---

# 7. Queue System

Use:

**BullMQ**

Install:

```bash
npm install @nestjs/bullmq bullmq
```

BullMQ is preferred over the older Bull package.

Recommended queues:

```text
draw-scheduler
draw-processing
settlement
payments
notifications
statistics
maintenance
```

Example:

```text
DRAW_COMPLETED
      ↓
settlement queue
      ↓
Settlement Worker
```

Queues must be idempotent.

A job being retried must never cause a double payout.

---

# 8. API Service

Create:

```text
backend/
```

Responsibilities:

* authentication
* user/account endpoints
* wallet balance endpoints
* market endpoints
* bet placement
* bet history
* draw history
* statistics endpoints
* payment-order creation
* real-time WebSocket gateway

The API service does NOT generate the official draw.

It does NOT perform final settlement.

---

# 9. Authentication

Lucky Six is Web3-first.

Do not build email/password authentication for V1.

Authentication flow:

```text
User connects Solana wallet
        ↓
Frontend requests nonce
        ↓
Backend creates one-time challenge
        ↓
User signs challenge with wallet
        ↓
Backend verifies signature
        ↓
Backend creates/finds user
        ↓
Backend issues authenticated session
```

The challenge must contain:

* domain
* wallet address
* nonce
* issued timestamp
* expiration timestamp
* purpose

Nonce must be single-use.

Never accept a previously used nonce.

---

# 10. Session

Use secure HTTP-only cookies for the web application.

Recommended:

```text
HttpOnly
Secure
SameSite=Lax or Strict
short-lived access/session credentials
```

Do not store long-lived authentication secrets in localStorage.

If JWTs are used, keep the access token short-lived and use proper rotation/session management.

---

# 11. Zod

Install:

```bash
npm install zod
```

Use Zod for validation at application boundaries.

Examples:

```text
bet placement request
payment order request
wallet authentication request
draw configuration
market configuration
admin operations
```

Never trust frontend validation.

---

# 12. API Security

Use:

```bash
npm install @nestjs/throttler
```

Rate-limit:

* authentication challenge
* authentication verification
* bet placement
* payment creation
* payment verification requests
* public API endpoints

Do not use one aggressive rate limit for everything.

Different routes need different limits.

Nest currently supports Redis-backed distributed throttling if the application is scaled horizontally.

---

# 13. Security Headers

NestJS currently supports security headers directly.

Enable:

```text
app.useSecurityHeaders()
```

Alternatively use Fastify-compatible Helmet if required.

Do not blindly copy an old Express Helmet configuration into Fastify.

---

# 14. Swagger / OpenAPI

Install:

```bash
npm install @nestjs/swagger
```

Expose Swagger only in development/staging or protect the production documentation endpoint.

The API should have documented endpoints for:

```text
/auth
/draws
/markets
/bets
/wallet
/payments
/statistics
```

---

# 15. WebSockets

Install:

```bash
npm install @nestjs/websockets @nestjs/platform-socket.io socket.io
```

The API service can expose the real-time gateway.

Events:

```text
draw.created
draw.open
draw.closing
draw.closed
draw.started
draw.result
markets.updated
settlement.started
settlement.completed
wallet.updated
jackpot.updated
```

If multiple API instances are eventually used, use Redis as the Socket.IO adapter so events can propagate between instances.

---

# 16. Draw Engine

Create:

```text
engine/
```

The Draw Engine must be a completely separate process.

Responsibilities:

* schedule draws
* create draw records
* open/close betting
* generate six balls
* apply Lucky Six mathematical rules
* determine whether 49 appears
* assign normal colors
* calculate derived statistics
* create immutable result
* publish draw completion event

It must NOT:

* place bets
* settle bets
* modify user balances
* verify Solana payments

---

# 17. Draw State Machine

A draw should have explicit states.

Example:

```text
SCHEDULED
    ↓
OPEN
    ↓
CLOSING
    ↓
CLOSED
    ↓
DRAWING
    ↓
RESULT_READY
    ↓
SETTLEMENT_PENDING
    ↓
SETTLED
```

Do not rely on random timers alone.

State transitions must be persisted.

---

# 18. Five-Minute Timing

The server is authoritative.

Example:

```text
Draw #10001
openAt
closeAt
drawAt
resultAt
```

The frontend only displays these timestamps.

The engine controls actual state transitions.

All internal timestamps are UTC.

---

# 19. Lucky Six Draw Generation

The engine should generate:

```text
6 balls
```

with:

```text
1–48 = normal balls
49 = special Black Jackpot ball
```

Normal colors:

```text
BLUE
YELLOW
RED
GREEN
```

Special:

```text
49 → BLACK → JACKPOT
```

The exact probability of 49 appearing must be configured in the game mathematics and NOT improvised inside the code.

The draw engine should have a dedicated domain module:

```text
engine/src/domain/draw/
```

with deterministic, testable functions.

---

# 20. Important Draw Integrity Rule

The draw result should be generated once.

After publication:

```text
draw result = immutable
```

Do not regenerate the result because of:

* settlement errors
* API failures
* user disputes
* frontend failures
* worker crashes

If settlement fails, retry settlement against the SAME draw.

Never regenerate the draw.

---

# 21. Betting Service

Bet placement should be handled by the API/Bet Service.

Flow:

```text
User
 ↓
POST /bets
 ↓
Validate authentication
 ↓
Validate draw is OPEN
 ↓
Validate market is active
 ↓
Validate selection
 ↓
Validate odds version
 ↓
Validate stake
 ↓
Atomically reserve/debit credits
 ↓
Create bet
 ↓
Return accepted bet
```

Use database transactions.

A bet must never be accepted if the balance cannot be atomically debited.

---

# 22. Bet Cutoff

Never trust the frontend countdown.

The backend checks:

```text
serverNow < bettingCloseAt
```

inside the bet placement logic.

If the request arrives after cutoff:

```text
BETTING_CLOSED
```

The API rejects it.

---

# 23. Idempotency

Bet placement must support idempotency.

A client retry must not create two bets.

Example:

```text
Idempotency-Key
```

Store the key against the resulting bet/request.

Same key + same authenticated user should return the original result.

---

# 24. Settlement Engine

Create:

```text
settlement/
```

This is completely separate from the API and Draw Engine.

Responsibilities:

* receive completed draw event
* load draw result
* load markets
* identify winning selections
* load eligible bets
* calculate payouts
* create settlement records
* credit winning wallets
* mark bets settled
* emit settlement completion event

It does NOT generate results.

---

# 25. Settlement Idempotency

This is mandatory.

A settlement operation may be retried.

Example:

```text
drawId = 10001
settlement status = PROCESSING
```

If the worker crashes:

```text
retry
```

It must continue safely.

Use unique database constraints such as:

```text
unique(draw_id, bet_id)
```

or an equivalent settlement key.

Never allow the same winning bet to be paid twice.

---

# 26. Wallet Ledger

Create a proper immutable ledger.

Example transaction types:

```text
CREDIT_PURCHASE
BONUS_CREDIT
BET_STAKE
BET_REFUND
BET_WIN
ADJUSTMENT
```

Every balance-affecting operation must create a ledger record.

Never simply:

```text
UPDATE wallet SET balance = balance + 500
```

without an auditable transaction record.

The balance update and ledger entry should occur in the same database transaction.

---

# 27. Solana Payment Service

Create:

```text
payment-worker/
```

or:

```text
payments/
```

Responsibilities:

* create payment orders
* quote SOL amount
* monitor submitted transactions
* verify transactions
* handle finality
* handle underpayment
* handle overpayment
* handle duplicate transactions
* credit SIM Credits after successful verification

The payment service must NOT trust the frontend saying:

```text
"I paid."
```

It independently verifies the blockchain transaction.

---

# 28. Payment Flow

```text
User selects package
        ↓
API creates payment order
        ↓
Current SOL reference price obtained
        ↓
SOL amount calculated
        ↓
Exact lamport amount locked
        ↓
Payment order expires after configured period
        ↓
Frontend creates/signs transaction
        ↓
Transaction signature returned
        ↓
Backend verifies transaction
        ↓
Correct network?
Correct recipient?
Correct amount?
Correct payment reference?
Successful?
Sufficient finality?
Already credited?
        ↓
Mark payment VERIFIED
        ↓
Credit SIM Credits
```

The frontend must never determine whether a payment succeeded.

---

# 29. Solana SDK

Use the current Solana Kit stack:

```bash
npm install @solana/kit @solana/kit-plugin-rpc
```

Use the server-side Kit client for:

* RPC calls
* transaction inspection
* transaction verification
* address handling
* lamport calculations

Do not put treasury signing keys in the API/frontend.

---

# 30. SOL Amounts

Never use floating-point SOL amounts internally.

Use:

```text
lamports
```

as integer values.

For example:

```text
0.005 SOL
=
5,000,000 lamports
```

Store integer lamports in the database.

---

# 31. SOL Price

Do not hardcode:

```text
$1 = X SOL
```

The payment service should obtain a current market reference price.

A reputable market-price provider such as CoinGecko can be used for the reference price.

The quote must be locked into the payment order.

Do not recalculate an old order using the current SOL price.

---

# 32. Payment States

Use explicit states:

```text
PENDING
SUBMITTED
CONFIRMING
VERIFIED
CREDITED
EXPIRED
FAILED
UNDERPAID
OVERPAID
REQUIRES_REVIEW
```

This makes payment reconciliation much easier.

---

# 33. Database Modules

Recommended domain structure:

```text
backend/
├── src/
│   ├── auth/
│   ├── users/
│   ├── wallets/
│   ├── ledger/
│   ├── draws/
│   ├── markets/
│   ├── bets/
│   ├── payments/
│   ├── statistics/
│   ├── realtime/
│   ├── health/
│   └── common/
│
├── prisma/
│   ├── schema.prisma
│   └── migrations/
│
└── test/
```

The engine and settlement service should reuse shared domain types/contracts but should not import API controllers.

---

# 34. Database Core Tables

Initial schema should be designed around:

```text
users
wallets
wallet_sessions
auth_challenges

ledger_accounts
ledger_entries

draws
draw_balls
draw_statistics

markets
market_selections
market_odds

bets
bet_selections
settlements

payment_orders
payment_transactions

audit_logs
```

Do not start coding these tables blindly.

First create an ERD and review all relationships.

---

# 35. Testing

Backend testing is mandatory.

Use:

```bash
npm install -D vitest
```

Test:

### Draw engine

* number boundaries
* color assignment
* 49 logic
* total calculation
* high/mid/low calculation
* duplicate-number rules
* deterministic seeded test draws

### Betting

* insufficient balance
* closed draw
* invalid market
* invalid selection
* duplicate idempotency key
* cutoff race conditions

### Settlement

* winning bet
* losing bet
* multiple winners
* zero winners
* retry
* duplicate processing
* payout calculation

### Payments

* valid transaction
* wrong recipient
* wrong amount
* duplicate transaction
* expired order
* underpayment
* overpayment

---

# 36. Observability

Implement structured logging.

Every important event should have:

```text
timestamp
service
requestId
drawId
betId
userId
paymentId
event
status
duration
```

Recommended tools:

* OpenTelemetry
* Sentry
* AWS CloudWatch

OpenTelemetry can later provide distributed traces between:

```text
API
 ↓
Redis
 ↓
Draw Engine
 ↓
Settlement
 ↓
Database
```

---

# 37. Health Checks

Every service should expose a health check.

Example:

```text
/health
```

Check:

* application alive
* PostgreSQL connection
* Redis connection
* queue availability
* Solana RPC availability where relevant

Do not let a service report healthy if its critical dependency is unavailable.

---

# 38. Backend Environment Variables

Use `.env` locally.

Production secrets should be stored in AWS Secrets Manager or an equivalent secure secret store.

Example:

```text
NODE_ENV
PORT

DATABASE_URL

REDIS_URL

JWT_SECRET

SOLANA_NETWORK
SOLANA_RPC_URL
SOLANA_TREASURY_ADDRESS

SOLANA_PAYMENT_REFERENCE_PREFIX

CORS_ORIGIN

SENTRY_DSN
```

Never commit `.env`.

---

# 39. Critical Backend Rule

The system must be designed so that:

```text
Frontend can crash
API can restart
Redis can restart
Settlement worker can crash
Payment worker can crash
```

without corrupting:

* draw results
* bets
* balances
* settlements
* payment records

PostgreSQL + idempotent workers + durable queues are the foundation for this.

# Lucky Six — Repository, Services & Infrastructure Setup

## 1. Recommended Project Structure

Use a single repository.

Recommended root:

```text
lucky-six/
│
├── frontend/
├── backend/
├── engine/
├── settlement/
├── payment-worker/
│
├── packages/
│   ├── contracts/
│   ├── config/
│   └── domain/
│
├── infra/
│   ├── docker/
│   ├── nginx/
│   └── aws/
│
├── docs/
│
├── docker-compose.yml
├── package.json
├── README.md
└── .gitignore
```

---

# 2. Frontend

```text
frontend/
```

Technology:

```text
Next.js
React
TypeScript
MUI
GSAP
Solana Kit
TanStack Query
Socket.IO client
```

This is the user-facing application.

---

# 3. Backend

```text
backend/
```

Technology:

```text
NestJS
Fastify
TypeScript
Prisma
PostgreSQL
Redis
Socket.IO
BullMQ
Solana Kit
```

Responsibilities:

```text
HTTP API
Authentication
Bet placement
Markets
Wallet/account APIs
Payment order creation
Realtime gateway
Read APIs
```

---

# 4. Draw Engine

```text
engine/
```

This is an independent worker/service.

Responsibilities:

```text
Scheduling
Draw lifecycle
Draw generation
49 Jackpot logic
Color generation
Statistics generation
Result publication
```

It must not contain:

```text
bet placement
wallet balance modification
settlement
```

---

# 5. Settlement Engine

```text
settlement/
```

Responsibilities:

```text
Consume completed draw events
Evaluate markets
Find winning bets
Calculate payouts
Create settlement records
Credit wallets
Mark bets settled
```

It must never generate a new draw.

---

# 6. Payment Worker

```text
payment-worker/
```

Responsibilities:

```text
Payment order monitoring
Solana transaction verification
Payment finality
Underpayment detection
Overpayment detection
Duplicate transaction detection
Crediting successful purchases
```

---

# 7. Shared Packages

Do not duplicate important interfaces between services.

Create:

```text
packages/contracts/
```

Contains:

```text
API contracts
WebSocket events
Queue event schemas
DTO types
Enums
```

Example:

```text
DrawStatus
BetStatus
PaymentStatus
SettlementStatus
MarketType
BallColor
RealtimeEvent
```

Create:

```text
packages/domain/
```

for pure domain logic that is genuinely shared.

Do not put database-specific code in shared packages.

---

# 8. Important Rule About Shared Code

Shared packages should not become a dumping ground.

Do NOT put:

```text
PrismaClient
Nest controllers
Redis clients
database repositories
AWS code
```

inside `packages/domain`.

Shared packages should primarily contain:

```text
types
schemas
pure functions
constants
contracts
```

---

# 9. Workspace

Prefer a workspace-based monorepo.

If using pnpm:

```text
pnpm-workspace.yaml
```

Example:

```yaml
packages:
  - frontend
  - backend
  - engine
  - settlement
  - payment-worker
  - packages/*
```

If the project is already standardized on npm, npm workspaces can also be used.

Do not mix package managers.

Pick one and commit the lockfile.

---

# 10. Local Development Infrastructure

Create:

```text
docker-compose.yml
```

Initially run:

```text
PostgreSQL
Redis
```

inside Docker.

Example conceptual setup:

```text
Docker
│
├── postgres
│   └── 5432
│
└── redis
    └── 6379
```

The application services can initially run directly on the developer machine.

Later they can all be containerized.

---

# 11. Local Service Ports

Use predictable ports.

Example:

```text
Frontend       3000
Backend API    4000
Engine         4100
Settlement     4200
Payments       4300
PostgreSQL     5432
Redis          6379
```

The engine/settlement/payment workers may not actually need public HTTP ports.

Their ports can be used only for health/debug endpoints.

---

# 12. Production Architecture

Initial AWS deployment:

```text
                    Internet
                       │
                       ▼
                ┌─────────────┐
                │     ALB     │
                └──────┬──────┘
                       │
                       ▼
                ┌─────────────┐
                │ API / EC2   │
                └──────┬──────┘
                       │
             ┌─────────┴─────────┐
             │                   │
             ▼                   ▼
        PostgreSQL             Redis
          RDS                ElastiCache
             │                   │
             └─────────┬─────────┘
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼
   Draw Engine     Settlement     Payment Worker
```

The services can initially share one EC2 machine.

They remain separate processes/containers.

---

# 13. Do Not Put Everything On EC2 Forever

EC2 is fine for the initial deployment.

But ideally:

```text
EC2
```

runs application processes.

Use managed services for critical infrastructure:

```text
RDS PostgreSQL
ElastiCache Redis
```

Do not manually maintain production PostgreSQL and Redis on the same EC2 machine if the product begins handling meaningful money/volume.

---

# 14. Docker

Create a Dockerfile for each service.

Example:

```text
frontend/Dockerfile
backend/Dockerfile
engine/Dockerfile
settlement/Dockerfile
payment-worker/Dockerfile
```

The services should be independently buildable.

Example:

```bash
docker build -t lucky-six-backend ./backend
docker build -t lucky-six-engine ./engine
docker build -t lucky-six-settlement ./settlement
docker build -t lucky-six-payment ./payment-worker
```

---

# 15. Nginx

Nginx can sit in front of services if required.

However, when using an AWS Application Load Balancer, do not add Nginx simply because it is common.

Use it only when we actually need:

* reverse proxy behavior
* custom static serving
* local production-like setup
* additional routing/control

Avoid unnecessary infrastructure.

---

# 16. CI/CD

Use GitHub Actions.

Pipeline should:

```text
push
 ↓
install
 ↓
lint
 ↓
typecheck
 ↓
unit tests
 ↓
build
 ↓
Docker build
 ↓
deploy
```

Production database migrations should run through CI/CD rather than developers manually pointing their local environment at production.

For Prisma, production migrations should use the appropriate Prisma production migration workflow.

---

# 17. Git Branch Structure

Recommended:

```text
main
develop
feature/*
fix/*
```

Production deploys from:

```text
main
```

Do not directly develop on `main`.

---

# 18. Environment Separation

Have:

```text
development
staging
production
```

Each environment should have separate:

```text
database
Redis
Solana configuration
treasury/payment configuration
secrets
```

For Solana:

```text
development → devnet
staging     → devnet
production  → mainnet
```

Do not accidentally point development code at the production treasury.

---

# 19. Production Solana Security

Treasury/private keys must never exist in:

```text
frontend
Git
Docker image
source code
ordinary environment files
```

If the payment architecture only needs to receive SOL, the backend does not need to hold a signing key for receiving funds.

Keep the treasury address public.

Keep any required signing credentials in a secure key-management system.

---

# 20. Database Backup

Production PostgreSQL must have:

* automated backups
* point-in-time recovery where available
* retention policy
* monitoring

Do not rely on application-level backups.

---

# 21. Redis Failure Strategy

Redis is not the source of truth.

If Redis disappears:

```text
application can recover
```

The database remains authoritative.

Queues should be configured for retry/recovery.

Draw schedules must not exist only in Redis.

---

# 22. Draw Engine Failure Strategy

Suppose the engine crashes during:

```text
Draw #18291
```

It must recover the draw state from PostgreSQL.

It must NOT simply create:

```text
Draw #18292
```

and forget #18291.

The draw lifecycle needs persistent state.

---

# 23. Settlement Failure Strategy

Suppose settlement crashes:

```text
Draw completed
↓
Settlement started
↓
worker crashes
```

On restart:

```text
Settlement worker
↓
find unfinished settlement
↓
resume/retry
↓
settle exactly once
```

Never regenerate the draw.

---

# 24. Payment Failure Strategy

Suppose:

```text
User pays SOL
↓
API crashes
```

The transaction still exists on Solana.

The payment worker should be able to discover/reconcile it.

Payment records must be idempotent.

A blockchain transaction must never result in two credit entries.

---

# 25. Important Database Constraints

Use database-level constraints for critical invariants.

Examples:

```text
unique wallet per user
unique auth nonce
unique payment transaction signature
unique payment order reference
unique settlement per bet/draw
unique bet idempotency key
```

Do not rely solely on application-level checks.

---

# 26. Service Communication

Prefer:

```text
HTTP
```

for synchronous API requests.

Use:

```text
BullMQ / Redis events
```

for asynchronous work.

Example:

```text
Draw Engine
     ↓
DRAW_COMPLETED queue event
     ↓
Settlement Worker
```

Do not make the Draw Engine synchronously call the Settlement Engine and wait for settlement before completing the draw.

The draw should remain completed even if settlement is temporarily unavailable.

---

# 27. Initial Event Flow

```text
Scheduler
    ↓
Draw Engine
    ↓
DRAW_CREATED
    ↓
API exposes markets
    ↓
Users place bets
    ↓
Bet Service records bets
    ↓
Betting closes
    ↓
Draw Engine generates result
    ↓
DRAW_COMPLETED
    ↓
Settlement Queue
    ↓
Settlement Engine
    ↓
Ledger
    ↓
SETTLEMENT_COMPLETED
    ↓
Realtime Gateway
    ↓
Frontend
```

---

# 28. Final Folder Tree

The final repository should look approximately like:

```text
lucky-six/
│
├── frontend/
│   ├── app/
│   ├── components/
│   ├── providers/
│   ├── hooks/
│   ├── lib/
│   ├── store/
│   ├── theme/
│   └── public/
│
├── backend/
│   ├── src/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── wallets/
│   │   ├── ledger/
│   │   ├── draws/
│   │   ├── markets/
│   │   ├── bets/
│   │   ├── payments/
│   │   ├── realtime/
│   │   └── health/
│   └── prisma/
│
├── engine/
│   └── src/
│       ├── scheduler/
│       ├── draw/
│       ├── mathematics/
│       ├── jackpot/
│       └── events/
│
├── settlement/
│   └── src/
│       ├── workers/
│       ├── markets/
│       ├── payouts/
│       ├── ledger/
│       └── events/
│
├── payment-worker/
│   └── src/
│       ├── solana/
│       ├── verification/
│       ├── reconciliation/
│       └── credits/
│
├── packages/
│   ├── contracts/
│   ├── domain/
│   └── config/
│
├── infra/
│   ├── docker/
│   ├── aws/
│   └── nginx/
│
├── docs/
│   ├── architecture.md
│   ├── betting.md
│   ├── settlement.md
│   ├── payments.md
│   └── draw-engine.md
│
├── docker-compose.yml
├── package.json
├── README.md
└── .gitignore
```

---

# 29. Build Order

Do NOT build everything simultaneously.

Build in this order:

## Phase 1 — Foundation

```text
Repository
TypeScript
shared contracts
PostgreSQL
Prisma
Redis
Docker
environment configuration
```

## Phase 2 — Draw Engine

```text
Draw lifecycle
Scheduler
6-ball generation
49 logic
Color logic
Statistics
Immutable results
```

## Phase 3 — Backend API

```text
Wallet authentication
Users
Draw APIs
Markets
Odds
Bet placement
Ledger
```

## Phase 4 — Settlement

```text
Settlement queue
Winning market evaluation
Payout calculations
Ledger credits
Idempotency
```

## Phase 5 — Solana

```text
Wallet connection
Signed authentication
Payment orders
SOL quote
Transaction verification
Credit purchases
Reconciliation
```

## Phase 6 — Realtime

```text
Socket.IO
Draw events
Market events
Settlement events
Wallet updates
```

## Phase 7 — Frontend

```text
Draw screen
Markets
Bet slip
Wallet
History
Statistics
Jackpot
Animations
```

## Phase 8 — Production

```text
Docker
AWS
RDS
ElastiCache
ALB
CloudWatch
Sentry
CI/CD
Backups
Monitoring
```

---

# 30. Most Important Rule

Do not start by installing 100 packages and writing random services.

First lock:

```text
1. Domain model
2. Database schema
3. Draw state machine
4. Market definitions
5. Odds model
6. Bet lifecycle
7. Settlement lifecycle
8. Wallet ledger rules
9. Payment lifecycle
10. Event contracts
```

Then implementation can begin.

The architecture should be complex internally where reliability requires it, but the actual responsibilities of each service should remain simple.

The goal is:

```text
Draw Engine
= produces truth about draws

Betting API
= accepts bets

Settlement Engine
= determines winners and pays them

Payment Worker
= verifies SOL purchases

PostgreSQL
= source of truth

Redis/BullMQ
= speed + coordination + asynchronous work

Next.js
= user experience
```

One **important correction** from our earlier conversation: I would **not** tell your developer to install the old `@solana/web3.js` + full wallet-adapter bundle for this new project. Solana's current docs now position **Solana Kit (`@solana/kit`) as the recommended TypeScript SDK**, with `@solana/react` and `@solana/kit-plugin-wallet` for React/browser-wallet work. The older Wallet Adapter route is still supported, but I'd only use it if a specific wallet/integration forces us to. ([Solana][2])

Also, **don't overbuild the AWS side on day one**. Your instinct about separate services is correct, but "separate service" does **not** mean "five EC2 machines." Run the API, engine, settlement worker, and payment worker as separate containers/processes initially, while PostgreSQL and Redis are managed separately. That gives you the architecture you want without burning money before Lucky Six has traffic.

[1]: https://nextjs.org/docs/app/getting-started/installation?utm_source=chatgpt.com "Getting Started: Installation | Next.js"
[2]: https://solana.com/docs/frontend?utm_source=chatgpt.com "Frontend | Solana"
[3]: https://tanstack.com/query/latest/docs/framework/react?utm_source=chatgpt.com "React | TanStack Query React Docs"
[4]: https://docs.nestjs.com/techniques/queues?utm_source=chatgpt.com "Queues | NestJS - A progressive Node.js framework"
[5]: https://docs.nestjs.com/v9/techniques/performance?utm_source=chatgpt.com "Performance (Fastify) | NestJS - A progressive Node.js framework"
[6]: https://www.prisma.io/docs/prisma-orm/quickstart/postgresql?utm_source=chatgpt.com "Quickstart: Prisma ORM with PostgreSQL | Prisma Documentation"
[7]: https://nextjs.org/docs/app/guides/progressive-web-apps?utm_source=chatgpt.com "Guides: PWAs | Next.js"
