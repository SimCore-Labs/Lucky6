# Lucky6 Markets, Odds, and Settlement

**Status:** Product and engineering specification with a local implementation snapshot; this does not mean wagering is production-ready
**Scope:** Define what a player may pick, how a price is calculated, and how a bet is settled for one Lucky6 draw
**Draw model reviewed:** Six ordered balls; numbers 1–48 are divided evenly among RED, BLUE, and GREEN; 49 is BLACK and may replace one normal ball

## 1. Executive recommendation

Launch with a small, explainable set of single-draw markets:

1. **Number appears** — choose one number from 1–49.
2. **First ball color** — RED, BLUE, GREEN, or BLACK.
3. **Majority color** — RED, BLUE, GREEN, or NO MAJORITY.
4. **Total sum band** — LOW, MID, or HIGH.
5. **Total sum over/under 122.5** — OVER or UNDER.
6. **Total sum odd/even** — ODD or EVEN.
7. **Exact color count** — choose RED, BLUE, or GREEN and predict its exact
   count; BLACK is a separate 49 jackpot outcome.
8. **Pick six numbers** — choose six distinct numbers from 1–49; 3, 4, 5, or 6
   matches win progressively higher prize tiers, while 0–2 matches lose.

The implemented pricing path derives probabilities from the draw model, applies
an 8% target margin with round-down cent odds, and locks the selected odds when
a bet is accepted. A bet may contain one market selection or one pick-six
ticket. User-approved credit settings are **100 credits = $1**, purchased with
SOL, winnings are non-withdrawable, and stakes are capped at 50 credits. The
current pick-six schedule is listed in Section 4.6.

This is a description of local code, not a production launch approval. Draws
still use `Math.random()`, the jurisdiction is undecided, and the legal,
operational, payment-network, and responsible-play controls listed in
[Section 10](#10-release-blockers-and-safety-controls) remain release gates.

## 2. What the current game does

The draw implementation in `engine/src/domain/draw/mathematics.ts` works as
follows:

- It makes one 2% jackpot decision.
- If the jackpot does not occur, it selects six distinct numbers from 1–48.
- If the jackpot occurs, it selects five distinct numbers from 1–48 and adds
  49.
- It assigns RED, BLUE, GREEN in a repeating pattern to 1–48; 49 is BLACK.
- It shuffles the ordered result. Positions are numbered 0–5 internally.
- Sum includes every drawn number, including 49.
- Majority counts only RED, BLUE, and GREEN. BLACK does not count toward a
  majority. A tie for the highest normal-color count is NO MAJORITY.

The engine currently opens betting for four minutes, waits 30 seconds after
closing, then generates the result. The jackpot probability is currently a
default in code rather than an immutable, round-specific public rule.

## 3. Market catalog

All definitions below refer to the six balls in one identified draw. A selection
is either a win or a loss; the proposed launch markets have no push outcome.
The exact winning conditions must be displayed to players before accepting a
bet.

### 3.1 Recommended launch markets

| Market | Selections | Wins when | Probability source |
|---|---|---|---|
| Number appears | 1–48, or 49 / BLACK JACKPOT | The selected number appears anywhere among the six balls. | Exact inclusion probability from the two draw branches. |
| First ball color | RED, BLUE, GREEN, BLACK | The ball with `orderIndex = 0` has the selected color. BLACK means 49 is first. | Exact first-position probability. |
| Majority color | RED, BLUE, GREEN, NO MAJORITY | The most frequent normal color is the selection. BLACK is excluded; tied leaders are NO MAJORITY. | Count combinations by color, separately for six-normal-ball and five-normal-plus-49 branches. |
| Total sum band | LOW, MID, HIGH | The sum including 49, if present, is in the selected inclusive range. | Exact sum distribution across both draw branches. |
| Total over/under 122.5 | OVER, UNDER | OVER means integer sum ≥123. UNDER means integer sum ≤122. | Exact sum distribution across both draw branches. |
| Total odd/even | ODD, EVEN | The complete sum, including 49, has the selected parity. | Exact count of combinations with each parity across both branches. |
| Exact color count | For RED, BLUE, or GREEN: exactly 0–6 of the selected color. For BLACK: exactly one BLACK (49 appears). | Count matching balls among all six result positions. BLACK appears at most once; do not offer "zero BLACK" as a color-count wager because it is a near-certain outcome with a decimal return below the stake at the standard margin. | Hypergeometric count for one normal color among 16 matching and 32 non-matching numbers, weighted across six-normal and five-normal-plus-49 branches. BLACK uses the jackpot probability. |
| Pick six numbers | Six distinct player-selected numbers from 1–49. | Count how many selected numbers appear in the six-ball result. The highest exact match tier is paid: exactly 3, 4, 5, or 6. Zero, one, or two matches pay nothing. If the ticket contains 49 and the jackpot occurs, that is one hit, plus any selected normal numbers that appear. | Hypergeometric hit-count distribution, with separate probabilities depending on whether the ticket contains 49. |

Use these non-overlapping sum bands, which cover the full possible result range:

- **LOW:** 21–120
- **MID:** 121–170
- **HIGH:** 171–279

The 21 minimum is the sum of 1–6. The 279 maximum is 49 plus the five
largest normal numbers (44–48). The over/under line is a separate market and
does not share the band boundaries.

### 3.2 Later markets (not launch requirements)

These can be added once their rules, pricing, limits, API representation, and
settlement tests are agreed:

| Candidate | Example selections | Additional rules to specify |
|---|---|---|
| Number in a position | First ball is 17; last ball is BLACK | Whether positions are numbered 1–6 in the UI; account for order permutations and the jackpot branch. |
| Number range count | At least two balls from 1–16 | Whether ranges include 49; define exact inclusive boundaries. |
| Exact color counts | Exactly two RED balls | BLACK is its own color or excluded; publish all mutually exclusive outcomes or a clearly defined subset. |
| Consecutive numbers | At least one consecutive pair | Define whether 48 and 49 count as consecutive. |
| Exact total | Sum is exactly 150 | Quote only when the probability is sufficiently measurable and the maximum payout is bounded. |
| Multi-selection/parlay | First ball RED and sum OVER | State that every leg must win; calculate combined probability rather than assuming independence; apply one margin policy; enforce a combined payout cap. |

Avoid unrestricted parlays at launch. Outcomes within one draw are often
correlated. Multiplying individual prices can produce a misleading quote unless
the joint probability is calculated or the combined payout is otherwise
controlled.

### 3.3 Exact color count rules

- The player selects one normal color (RED, BLUE, or GREEN) and one exact
  count from 0 to 6. The count is the number of balls of that color in the
  completed draw, regardless of draw order.
- BLACK is counted separately and only occurs when 49 is drawn. Offer the
  meaningful BLACK selection as **exactly 1 BLACK**; the complementary
  no-jackpot outcome is already represented by other markets and would have
  decimal odds below 1 at the proposed margin.
- A normal color has 16 numbers out of the 48 normal numbers. If the jackpot
  branch occurs, 49 is BLACK and exactly five normal balls contribute to the
  RED/BLUE/GREEN count.
- Color-count outcomes are mutually exclusive within one chosen color; a bet on
  exactly 3 RED does not also win as exactly 2 RED.
- Keep this distinct from **majority color**: exact count predicts a number of
  balls in a color; majority predicts which normal color has the greatest
  count, with ties going to NO MAJORITY.

### 3.4 Pick-six ticket rules

1. The player selects exactly six **distinct** values from 1–49. The interface
   must not accept repeated numbers or fewer/more than six.
2. After the draw, count the intersection of the player's set and the six
   drawn numbers. Order does not matter.
3. Pay the highest applicable tier only:
   - 0, 1, or 2 matches: lose; no payout.
   - exactly 3 matches: tier 3 payout.
   - exactly 4 matches: tier 4 payout.
   - exactly 5 matches: tier 5 payout.
   - exactly 6 matches: tier 6 payout.
4. A selected 49 counts as a normal hit if 49 is drawn. It does not replace
   any of the other selected values. Since jackpot draws contain 49 and only
   five normal values, the matching count must be calculated against the
   complete result set, not by assuming every draw consists of six values in
   the range 1–48.
5. Show the selected numbers, stake, tier table, and maximum gross payout in
   the confirmation receipt. Lock the tier schedule/version when accepting
   the ticket.

This is a **single ticket with a tiered prize schedule**, not four separate
single-outcome bets. Do not calculate each tier's payout independently as
`(1 - margin) / P(tier)`: doing that for all four tiers would multiply the
expected return budget by four.

## 4. Odds model

### 4.1 Decimal odds and payout terminology

Display **decimal odds**. For a stake `S` and accepted odds `O`:

- **Gross return on a win:** `floor(S × O)` credits, including the returned
  stake component.
- **Net profit on a win:** gross return minus the original stake.
- **Loss:** the stake remains debited; payout is zero.

Example: a 10-credit bet at 2.77 returns 27 credits gross (10 original stake
plus 17 net profit), subject to the documented integer-credit rounding rule.
The settlement implementation currently pays the gross amount and floors to a
whole credit.

### 4.2 Base price

For selection `i`:

```text
raw decimal odds = (1 - target margin) / probability(i)
offered odds     = round down to 2 decimal places, subject to an approved minimum
```

An 8% starting margin therefore targets a 92% expected gross return on a
single selection before rounding and other costs. For mutually exclusive,
exhaustive outcomes, the implied-probability sum is approximately
`1 / 0.92 = 1.08696` (the overround). Rounding can move the realized margin;
measure and publish the actual policy rather than promising an exact return.

**Recommendation:** use exact arithmetic / decimal math for the calculation,
and round down (never to nearest) to avoid accidentally increasing an offered
price above the configured price. Define and test a minimum and maximum odds
before enabling markets. If a probability is missing, zero, stale, or invalid,
do not display or accept the selection.

### 4.3 Dynamic exposure pricing

Do not add an ad-hoc probability adjustment at launch. First calculate fair
probabilities and enforce per-selection, per-draw, and total payout limits.
Later, exposure pricing may adjust quotes based on accepted liabilities, but it
must:

1. Use the same shared calculation for quote display and bet acceptance.
2. Include liabilities from all open bets, not merely recent bet volume.
3. Bound odds and total potential payout.
4. Create a new odds version whenever an offered price changes.
5. Preserve the accepted odds for already-placed bets.
6. Be observable and testable against maximum-loss scenarios.

`PricingConfig.exposureFactor` exists in the schema but is not currently used by
the pricing engine. It should not be treated as an active risk control.

### 4.4 Illustrative prices from the current draw rules

The following are theoretical examples at an 8% margin, rounded down to two
decimal places. They are **not a quote for a live bet** and should be regenerated
from the exact production rules before display.

| Selection | Theoretical probability | Illustrative odds |
|---|---:|---:|
| Any one normal number (1–48) appears | 12.4583% | 7.38 |
| 49 appears anywhere | 2.0000% | 46.00 |
| First ball is RED (same probability for BLUE or GREEN) | 33.2222% | 2.76 |
| First ball is BLACK (49 is first) | 0.3333% | 276.00 |
| Majority is RED (same probability for BLUE or GREEN) | 25.9599% | 3.54 |
| NO MAJORITY | 22.1203% | 4.15 |
| LOW sum (21–120) | 20.5852% | 4.46 |
| MID sum (121–170) | 55.1868% | 1.66 |
| HIGH sum (171–279) | 24.2790% | 3.79 |
| OVER 122.5 | 77.6196% | 1.18 |
| UNDER 122.5 | 22.3804% | 4.11 |
| ODD total | 50.0081% | 1.83 |
| EVEN total | 49.9919% | 1.84 |

The pricing helper uses **round-down** cent odds. Runtime values also depend on
the configured jackpot probability and active draw rules. The 2% jackpot draw
probability does not mean the first ball is BLACK 2% of the time: its
first-position probability is 2% / 6.

### 4.5 Illustrative exact color-count probabilities

The following are example probabilities for one normal color at the current
2% jackpot probability. RED, BLUE, and GREEN have the same distribution. The
illustrative single-selection price is `(1 - 8% margin) / probability`, rounded
down to two decimals. These figures demonstrate the calculation; they are not
an approved production price list. The 6-of-one-color selection has very high
odds and should be disabled unless it fits the maximum-odds and liability
limits.

| Exact count of chosen normal color | Probability | Illustrative odds |
|---:|---:|---:|
| 0 | 7.4720% | 12.31 |
| 1 | 26.4030% | 3.48 |
| 2 | 35.1563% | 2.61 |
| 3 | 22.5063% | 4.08 |
| 4 | 7.2771% | 12.64 |
| 5 | 1.1213% | 82.04 |
| 6 | 0.0640% | 1,438.58 |

For BLACK, exactly one BLACK has probability 2% and illustrative odds 46.00
at the same margin. Do not offer exact zero BLACK as a standalone selection
under this margin policy: its raw decimal price is below 1.00.

### 4.6 Pick-six tier probability and prize schedule

The match probabilities depend on whether the six-number ticket contains 49.
At the current draw probability, the exact tier probabilities are:

| Matches | Ticket excludes 49 | Ticket includes 49 |
|---:|---:|---:|
| 0 | 42.8863% | 48.6861% |
| 1 | 41.5449% | 39.5608% |
| 2 | 13.6092% | 10.5762% |
| 3 | 1.8537% | 1.1297% |
| 4 | 0.1039% | 0.0466% |
| 5 | 0.0020% | 0.0006% |
| 6 | 0.000008% | 0.000001% |

These are **tier probabilities**, not final ticket odds. The current schedule
uses the following gross payout multipliers, where the payout includes the
stake:

| Match tier | Excludes 49 | Includes 49 |
|---:|---:|---:|
| 3 | 31x | 54x |
| 4 | 250x | 450x |
| 5 | 4,000x | 15,000x |
| 6 | 5,000x | 20,000x |

The schedule is version 1. With the modeled probabilities, expected gross
returns are approximately 91.55% for tickets excluding 49 and 90.92% for
tickets including 49. The maximum stake is 50 credits and the maximum gross
payout is 1,000,000 credits. The backend checks the maximum tier liability
before accepting a ticket and stores the applicable schedule with it.

Any future schedule must choose gross payout multipliers `M3`–`M6` together
such that:

```text
P(3 matches) × M3
+ P(4 matches) × M4
+ P(5 matches) × M5
+ P(6 matches) × M6
<= target expected gross return
```

For an 8% target margin, the right-hand side is 0.92. The probability row to use
must match whether the ticket contains 49. Round the final monetary/credit
payout down according to the published whole-credit rule. Set a maximum payout
and exposure cap before enabling the 5- and 6-hit tiers; their probabilities
are very small. Configure and version one tested schedule for tickets that
include 49 and another for tickets that exclude it, or use a single conservative
schedule proven to stay within the target for both classes. Do not promise the
same hit-tier odds across those two classes without pricing for the different
probabilities.

The tier payout multipliers are a product decision: select them to balance
frequent lower-tier rewards against rare high-tier prizes, then verify the
expected return and maximum liability mathematically. The probabilities alone
do not determine a unique prize table.

## 5. Probability calculation requirements

Use the actual draw distribution, not historical frequencies or rough
percentages:

- For numbers 1–48, each number has the same chance of inclusion:
  `((1 - p) × 6 + p × 5) / 48`, where `p` is the jackpot-branch probability.
- For 49, chance of inclusion is `p`.
- For first position, normal colors account for their 16 numbers and the five
  normal balls in the jackpot branch; BLACK has probability `p / 6`.
- For majority, sum the number of combinations producing each color count.
  Normal colors each have 16 numbers. The jackpot branch has five normal balls,
  and 49 does not participate in the majority.
- For sum bands, over/under, and parity, enumerate or dynamically count
  combinations from 1–48 for both `k = 6` and `k = 5`; add 49 to the jackpot
  branch sum; weight the branches by `1 - p` and `p`.
- For exact RED/BLUE/GREEN count `c`, use
  `C(16, c) × C(32, k - c) / C(48, k)` for each branch's `k` normal balls
  (6 without the jackpot, 5 with it), then weight by the branch probability.
- For a pick-six ticket containing `m` normal numbers (`m = 6` if it excludes
  49, otherwise `m = 5`), compute normal-branch matches with the hypergeometric
  distribution for drawing six normal balls. For the jackpot branch, compute
  matches among five normal balls and add one guaranteed hit if the ticket
  contains 49. Weight both distributions by `1 - p` and `p`.
- Verify every exhaustive outcome family sums to probability 1 within a defined
  numeric tolerance.
- Keep the draw probability `p`, rules version, and pricing version associated
  with every draw and accepted bet. A later configuration change must not
  silently reprice an open round or reinterpret a historical result.

The published examples above are derived from the current 2% setting and
combinatorial enumeration. Implementations should have automated tests for the
probabilities and boundary cases rather than copying the rounded example
values into seed data.

## 6. Bet acceptance and player receipt

Before a bet is accepted, the server should validate, in one atomic operation:

1. The player is authenticated and the wallet is taken from that authenticated
   identity, not trusted from a caller-supplied wallet ID.
2. The draw exists and is OPEN; the current time is before `closeAt`.
3. The market and selection are active and belong to that draw's rule version.
4. The stake is a positive integer credit amount and is within configured
   minimum and maximum limits.
5. The displayed odds version is still acceptable. If the price changed, return
   the new price and require the player to confirm it.
6. The wallet has sufficient balance and the debit is atomic under concurrency.
7. The request idempotency key has not already created a different bet.
8. Exposure limits remain satisfied after adding the bet's maximum liability.

Return and persist a receipt with bet ID, draw number, market, selection,
integer stake, locked decimal odds, maximum gross payout, accepted-at time, and
rules/odds version. Do not silently change odds after the confirmation.

## 7. Settlement rules

For each draw:

1. Accept no new bets after betting closes.
2. Persist the complete result and derived statistics before settlement starts.
3. Load all accepted bets for that draw and evaluate each selection using the
   versioned rule definition.
4. A single-selection bet wins if that selection's rule is true; otherwise it
   loses. A future parlay wins only if every leg wins.
5. On a win, credit the gross return computed from the accepted stake and
   locked odds. On a loss, leave the already-debited stake unchanged and record
   zero payout.
6. Write the wallet change, ledger entry, bet status, and settlement record
   atomically and idempotently. Emit completion events only after commit.
7. Mark the draw SETTLED only after every accepted bet has a final settlement.

**Voids and refunds:** define a deterministic policy before launch. Recommended:
if a draw is canceled, corrupt, missing a complete six-ball result, or cannot be
settled under its recorded rules version, void its bets and refund each stake
once. Do not treat unsupported selections as losses. Record the reason, refund
ledger entry, and audit event.

## 8. Current implementation versus proposal

| Area | Current repository behavior | Gap to resolve |
|---|---|---|
| Markets | Seed includes number, jackpot, majority, sum bands, over/under, parity, exact color count, and pick six. | Add rule-version snapshots and operator controls over which markets are enabled per draw. |
| Pricing | Exact combinatorial distributions use the configured jackpot probability; unsupported selections have no odds; decimal odds round down to cents. | Add per-draw quote snapshots, exposure/liability controls, and monitoring before production. |
| Bet authentication | Wallet sign-in verifies an Ed25519 challenge; bets use the wallet from an HttpOnly session, not caller-supplied identity. | Add rate limiting, session cleanup, and production-origin review; no deployment verification has been done. |
| Bet acceptance | Atomic balance debit, integer stake validation, 50-credit stake cap, idempotency, active draw/market checks, odds-version checks, and maximum gross-payout checks are implemented. | Add per-wallet/draw exposure limits and a clear operator cancellation/void flow. |
| Exact color count | RED/BLUE/GREEN exact counts 0–6 and BLACK:1 are seeded, priced, and settled. | Confirm final player wording and market availability policy. |
| Pick six | Six unique numbers are validated; tiers are versioned and persisted with tickets; settlement counts matches and pays the highest tier. | Add a player receipt with the full tier table and settlement details; current UI summarizes the third-hit return. |
| Payout math | Integer/BigInt arithmetic is used for stake debits and gross payouts; account ledger entries are written in the settlement transaction. | Add reconciliation and operator audit tooling. |
| SOL payments | Orders are wallet-bound and idempotent; unique references are attached to transfers and reconciled; worker requires a finalized exact payer-to-treasury transfer before one-time crediting. Under/overpayment is not auto-credited. | Verify mainnet treasury/RPC settings, add support/refund operations, and run end-to-end payment tests. See [SOL payment setup](./PAYMENTS_AND_SOLANA_SETUP.md). |
| Cancellation | No complete void/refund workflow is implemented. | Add an idempotent void/refund process and test it before launch. |
| RNG | Draw uses `Math.random()` with no independently verifiable proof. | Replace with an approved, auditable randomness design before accepting valuable stakes. |

## 9. Suggested rollout

### Phase 0 — Decide and document

- Approve game rules, market wording, margin, odds precision, min/max stake,
  max payout, void policy, and whether credits have monetary value or redemption.
- Confirm that all public odds examples are illustrative, not guaranteed prices.

### Phase 1 — Controlled internal testing

- Keep real-value payments and wagering disabled until the jurisdiction,
  fairness design, exposure limits, void/refund support, operational monitoring,
  and payment verification flow have been approved and tested.
- Add test matrices for every market outcome, payment status transition, and
  boundary; reconcile credits against the ledger.

### Phase 2 — Auditable game and responsible controls

- Adopt a verifiable randomness method and publish enough proof for players to
  check draws independently.
- Add clear bet history, results, payout receipts, limits, self-exclusion, and
  support/dispute records where required by the jurisdiction.
- Obtain legal/compliance review before allowing purchase or redemption of
  wagerable credits. This document is not legal advice.

### Phase 3 — Carefully bounded additions

- Add ranges, positions, or combinations only with their own probability
  implementation, rule version, settlement tests, limits, and player-facing
  explanation.
- Pilot exposure pricing and parlays separately, with caps and monitoring.

## 10. Release blockers and safety controls

The following issues are material blockers to presenting the current product
as production-ready wagering:

- Draw generation still uses `Math.random()` and has no independently
  verifiable proof or published round seed.
- The operating jurisdiction is undecided. Obtain jurisdiction-specific legal,
  licensing, age/identity, responsible-play, tax, and payment-provider review;
  user-provided approval claims have not been independently verified.
- There are no per-wallet/per-draw exposure limits, self-exclusion controls,
  complete canceled-draw refund flow, or support/dispute tooling.
- The frontend and payment worker must be configured for the same Solana
  network and compatible RPC; verify treasury configuration before deployment.
- Settlement, payment processing, and end-to-end wallet flows still need
  production-like integration tests and ledger reconciliation.
- The current local code has not been deployed or verified against production.

The auth bypass, caller-supplied wallet identity, unsupported-market fallback,
concurrent debit, and floating-point payout issues described in earlier
iterations have been addressed in the local implementation. Keep them covered
by regression tests and re-verify the deployed commit before enabling real
payments or wagering.

## 11. Source references

- Draw generator and ball colors: `engine/src/domain/draw/mathematics.ts`
- Round lifecycle: `engine/src/draw-scheduler.service.ts`
- Market seed: `backend/prisma/seed.ts`
- Pricing engine: `backend/src/pricing/pricing-engine.service.ts`
- Bet endpoint and market API: `backend/src/game/game.controller.ts`
- Data model: `backend/prisma/schema.prisma`
- Settlement evaluator: `settlement/src/domain/settlement-evaluator.service.ts`
- Settlement worker: `settlement/src/settlement.service.ts`
- Existing integration review and API notes: `docs/FRONTEND_GAME_AND_API_GUIDE.md`
