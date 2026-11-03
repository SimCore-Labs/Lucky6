# Betting Mechanics Engineering Brief

**Status:** Implemented locally; backend validation, migration, and deployment pending  
**Scope:** Odds, selections, bet confirmation, and settlement for the betting UI

## Executive summary

The implementation adds exact pricing and settlement for flexible Lucky Six
and inverse Bet Zero picks, connects each game to a shared bet slip, and adds
per-bet stakes with a review-and-confirm flow. Existing single-selection games
remain independent bets; Rainbow can stage several independent bets. The UI
uses active quotes from `GET /markets`, while the API validates and locks the
accepted quote for settlement.

The user has now confirmed the core selection rules:

1. Lucky Six allows 1–6 picks; every selected number must appear in the draw.
   Any selected number that does not appear makes the bet lose.
2. Bet Zero is the inverse: every selected number must be absent. Odds should
   be calculated from the existing 8% margin.
3. High/Low remains three model-priced outcomes.
4. Multiple Rainbow choices are independent bets with a separate stake per
   selection; they are not a parlay.
5. Changing the selected game clears the previous game's selections. Selections
   are not carried between games.

The user confirmed 49 is eligible in both games and the one-million-credit cap
must remain. The implementation therefore enforces the cap at settlement while
still accepting valid bets whose theoretical payout exceeds the cap; the final
awarded payout is trimmed to the cap instead of rejecting the ticket before it is
accepted.

## Repository findings

### Draw and pricing model

- Each draw contains six distinct balls. Numbers 1–48 are split evenly across
  RED, BLUE, and GREEN; 49 is BLACK.
- The default draw model includes 49 with probability 2%. Otherwise it selects
  six normal balls; if 49 appears, it selects five normal balls plus 49.
- The pricing engine calculates combinatorial probabilities, applies the
  configured house margin (default 8%), and rounds offered odds down to cents.
- Odds are versioned in the database. The bet endpoint requires the submitted
  odds version to still be current and returns a conflict if it changed.
- The pricing engine reads a configurable jackpot probability. The draw
  scheduler currently calls the generator with its 2% default and does not
  persist a per-draw probability/rules snapshot. Changing only the pricing
  configuration could therefore make prices diverge from generated draws.
- Pricing refresh currently runs at API startup, not at each draw opening.
  `exposureFactor` exists in the schema but is not applied by the pricing path.

### Current UI-to-market mapping

| UI | Current market or behavior | Current limitation |
|---|---|---|
| Lucky Six | `PICK_NUMBERS_APPEAR` | New market has selections for 1–6 picks; all selected numbers must appear. |
| Bet Zero | `PICK_NUMBERS_ABSENT` | New market has selections for 1–6 picks; all selected numbers must be absent. |
| Rainbow | `COLOR_COUNT`; odds come from `GET /markets` | Multiple selected outcomes are staged separately, each with its own stake and independent bet submission. |
| High Low | `SUM_HIGH_MID_LOW` | Three selections: LOW, MID, HIGH, each with separately calculated odds. |
| Odd Even | `SUM_ODD_EVEN` | Single selection at a time; prices come from `GET /markets`. |
| Total Color | `COLOR_MAJORITY` | Selects the majority color/no-majority outcome; prices come from `GET /markets`. |

The implementation keeps the active slip in the UI store. Ordinary games
replace one another's selection; Rainbow can stage several independent
outcomes. Changing games clears the previous game's bet. The initiator gets
the current draw and wallet session, previews each bet, and submits each
independently after explicit confirmation.

### Bet API and settlement

- `POST /bets` is session guarded. The server derives the wallet from the
  authenticated session; the browser must include the session cookie.
- The accepted request supports one `SELECTION`, legacy `PICK_SIX` tickets,
  and `PICK_NUMBERS` tickets with 1–6 distinct picks and an active market
  selection/odds version.
- Stake is a whole-number credit amount with a 10-credit minimum. The
  effective maximum is bounded by available wallet balance and the
  1,000,000-credit gross payout cap; valid bets are accepted and settlement
  caps the awarded payout rather than rejecting the ticket before it is
  created. Bets have idempotency keys.
- The server checks that the draw is open, validates active odds/version,
  debits balance atomically, records a ledger entry, and locks odds with the
  bet.
- Settlement evaluates one selection per normal bet. A non-Pick-Six bet with
  any selection count other than one is treated as invalid by settlement.
  Multiple Rainbow choices must therefore be submitted as independent bets,
  not one combined bet.
- New number-pick tickets persist the game type, selected numbers, locked odds,
  odds version, and rules version. Existing accepted `PICK_SIX` tickets retain
  their legacy settlement path; new Pick Six market placement is disabled.
- The confirmation UI should preview only. The server remains authoritative;
  stale odds must prompt another review, never silent acceptance.

### Documentation review

The integration guide, market/settlement spec, and settlement README have been
updated to reflect the new ticket rules, API contract, single-selection
settlement invariant, and legacy Pick Six handling. The root README still
contains older architecture/proposal material and should not be treated as the
runtime contract. The pricing docs also identify the unresolved runtime
configuration risk: pricing can read a configurable jackpot probability while
the draw generator currently uses a 2% default.

## Odds findings

### High / Mid / Low

The model-derived probabilities at the current 2% jackpot probability are:

| Outcome | Probability | Example odds at 8% margin |
|---|---:|---:|
| LOW (sum 21–120) | 20.5852% | 4.46 |
| MID (sum 121–170) | 55.1868% | 1.66 |
| HIGH (sum 171–279) | 24.2790% | 3.79 |

These are analytical probabilities from the implemented draw model, not live
quotes. A read-only check of the deployed API returned 20 recent draws through
draw #2663: LOW appeared 4 times, MID 10 times, and HIGH 6 times. This small
recent sample also has MID as the most frequent band, but it is descriptive
only and does not replace theoretical probabilities for pricing.

Giving HIGH and LOW identical odds is a separate pricing policy, not the exact
per-outcome 8%-margin price. Combining HIGH and LOW into one selection changes
the winning rule and also requires a product decision.

### Bet Zero examples

For `n` distinct normal-number selections, the probability that none appears
is calculated across the two draw branches:

```text
P(n all absent) =
  0.98 × C(48 - n, 6) / C(48, 6)
  + 0.02 × C(48 - n, 5) / C(48, 5)
```

Illustrative odds below apply the existing 8% margin and cent round-down.
The first table assumes picks are from 1–48.

| Selected normal numbers | Probability all are absent | Example odds |
|---:|---:|---:|
| 1 | 87.5417% | 1.05 |
| 2 | 76.4043% | 1.20 |
| 3 | 66.4733% | 1.38 |
| 4 | 57.6419% | 1.59 |
| 5 | 49.8105% | 1.84 |
| 6 | 42.8863% | 2.14 |

These show why Bet Zero prices rise with the number of predictions: all
selected numbers must be absent for the ticket to win. The suggested examples
in the request (1.10, 1.25, 1.45, 1.60) represent a different price schedule.
49 is allowed; if selected, all remaining picks are normal numbers and the
jackpot branch necessarily loses:

| Picks including 49 | Probability all are absent | Example odds |
|---:|---:|---:|
| 1 | 98.0000% | 1.01 (minimum odds floor) |
| 2 | 85.7500% | 1.07 |
| 3 | 74.8032% | 1.22 |
| 4 | 65.0463% | 1.41 |
| 5 | 56.3734% | 1.63 |
| 6 | 48.6861% | 1.88 |

The 1.01 minimum prevents decimal odds below 1.00; this outcome therefore has
an effective margin of about 1.02%, not 8%.

### Variable-count Lucky Six

Every selected number must appear; other unselected draw numbers do not affect
the win. Pricing depends both on pick count and whether 49 is selected, because
49 appears only in the 2% jackpot branch.

| Picks | All normal picks: probability | All normal picks: odds | Includes 49: probability | Includes 49: odds |
|---:|---:|---:|---:|---:|
| 1 | 12.4583% | 7.38 | 2.0000% | 46.00 |
| 2 | 1.3209% | 69.64 | 0.2083% | 441.60 |
| 3 | 0.1145% | 803.65 | 0.0177% | 5,188.80 |
| 4 | 0.0076% | 12,095.51 | 0.0012% | 79,561.60 |
| 5 | 0.0003446% | 267,003.33 | 0.0000514% | 1,790,136.00 |
| 6 | 0.0000080% | 11,520,194.93 | 0.0000012% | 78,765,984.00 |

These are illustrative model odds, rounded down using the current pricing
function. With the confirmed one-million-credit gross-payout cap, the maximum
legal stake varies by pick count, selected numbers, and the cap calculation;
values are published as the selection's `maxStake` and the UI must show them
before confirmation. A pick set is marked unavailable when even a 1-credit
stake would exceed the cap, rather than reducing the odds to fit.

### Business-safe pricing policy

Use the existing model-based quote path and the existing 8% margin rather than
historical-frequency pricing or manually guessed prices:

1. Calculate the exact probability from the configured draw process and the
   pick count / whether 49 is selected.
2. Calculate decimal odds using `(1 - 0.08) / probability`, rounded down to
   cents and subject to the current minimum of 1.01.
3. Keep the 10-credit minimum stake, the wallet-balance checks, and the
   1,000,000-credit gross-payout cap. Validate them atomically on the server;
   display the maximum legal stake before confirmation.
4. If the minimum one-credit stake would exceed the payout cap, mark that pick
   set unavailable. Do not silently cap the odds, because that would make
   displayed odds depend on stake and conceal a materially different price.
5. Persist the accepted quote, odds version, and ticket rule version. Before
   making jackpot probability configurable, ensure each draw and its prices
   use the same snapshotted probability; the current generator does not store
   that snapshot.

This protects the business from unbounded liability while keeping offered odds
explainable. It does mean the confirmed 1–6 selection-count range is not
available for every combination under the retained cap. The 1.01 minimum also
means very likely outcomes (notably Bet Zero selecting 49 alone) have a lower
effective margin than 8%; a separate fee or a lower-than-1.00 payout would be a
different product rule and is not introduced here.

## Implementation and remaining verification

Implemented locally:

- Exact appearance/absence probabilities, market seeding, number-ticket
  persistence, API validation, and settlement while retaining legacy ticket
  compatibility.
- Shared bet slip, per-bet stake and payout preview, confirmation flow,
  independent Rainbow submissions, and clearing selections on game changes.
- Updated API, market/odds, and settlement documentation.
- Frontend typecheck and lint pass.

Still required before release:

1. Generate Prisma code and run backend/settlement typechecks and focused
   pricing/controller/settlement tests on the approved deployment machine.
2. Review and apply the Turso migration and seed the new markets only after
   those checks pass.
3. Deploy the API and settlement worker, then verify the active markets and
   full placement-to-settlement flow.

The deployed API was checked read-only: `/health` reports database and Redis
healthy; `/markets` still exposes the old catalog and no number-pick market.
`/draws/results?limit=20` returned 20 recent draws through #2663. No remote
writes or deployment were performed. Backend package installation was
intentionally not attempted; local Prisma generation and backend/settlement
typechecks could not complete without generated Prisma code and workspace
dependencies. Frontend typecheck and lint pass.

## Confirmed rule implementation notes

The current one-million-credit cap prevents some exact-price 5/6-pick Lucky
Six combinations. Such a pick is unavailable when even a one-credit stake
exceeds the cap. This limitation must be surfaced in the UI and enforced by the
API.

## Confirmed product rules

- **Lucky Six:** 1–6 selected numbers; all selected numbers must appear or the
  ticket loses. No partial-match tiers; this replaces the old 3–6 match tier
  behavior.
- **Bet Zero:** 1–6 selected numbers; all selected numbers must be absent.
  Number 49 is allowed. Price from the exact model probability at the existing
  8% margin, subject to the 1.01 odds floor.
- **High/Low:** retain three outcomes and use model-derived odds. The model
  makes MID most common; historical draw counts are not used to override it.
- **Rainbow:** allow multiple selections, enter a separate stake for each,
  submit each as an independent bet, and show each acceptance/error separately.
- **Risk limits:** retain a 10-credit minimum stake, wallet-balance checks, and
  one-million-credit
  gross-payout cap. Reject and explain any exact-price selection that exceeds
  the cap even at the one-credit minimum.
