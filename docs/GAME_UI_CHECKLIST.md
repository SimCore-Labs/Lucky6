# Lucky6 game UI checklist

This checklist defines the game interface to design and build next. The existing
TV results page remains the only current page; this document is for planning a
new betting experience, not a request to restore the removed design.

## 1. Product and navigation

- [ ] Keep `/tv` as the results and statistics experience.
- [ ] Decide whether `/` should continue redirecting to `/tv` or become the new
  game entry point.
- [ ] Create a new, intentional betting route and navigation entry.
- [ ] Keep the game UI visually distinct from TV; do not bring back the old
  lobby or ticket-builder layout.
- [ ] Make wallet connection, SIM balance, bet history, and sign-out available
  without crowding the game-selection experience.
- [ ] Clearly state that stakes and balances are SIM credits and whether
  real-value wagering is unavailable.

## 2. Game and market selection

- [ ] Load active, priced markets from `GET /markets`; do not hardcode market
  odds or assume every seeded market is active.
- [ ] Present the available games in a clear, scannable way:
  - [ ] Pick Six: choose six distinct numbers from 1–49.
  - [ ] Number Appears: select one number from 1–49.
  - [ ] Black Jackpot: predict whether 49 appears.
  - [ ] Majority Color: red, blue, green, or no majority.
  - [ ] Sum Range: low, mid, or high.
  - [ ] Sum Over/Under: under (122 or less) or over (123 or more).
  - [ ] Sum Odd/Even.
  - [ ] First Ball Color: red, blue, green, or black.
  - [ ] Exact Color Count: choose red, blue, or green and a count from 0–6;
    black is available only as exactly one.
- [ ] Treat Pick Six as its own bet type; its `selections` list is empty because
  the player supplies six numbers.
- [ ] For selection markets, show only options returned with active odds.
- [ ] Explain game rules and outcome boundaries before the player commits.
- [ ] Show the active draw number, status, and closing time; prevent submission
  when the draw is closed or unavailable.

## 3. Bet slip and confirmation

- [ ] Design a focused bet slip for the currently selected game and choice.
- [ ] Let the player enter a whole-number stake from 1 to 50 SIM credits.
- [ ] Show the wallet balance and indicate insufficient balance before submit.
- [ ] Show current odds for selection bets and the applicable Pick Six payout
  tier multipliers.
- [ ] Label projected returns clearly and distinguish stake from gross return.
- [ ] Require an explicit review/confirmation step before placing a bet.
- [ ] Recheck draw availability, balance, and current odds with the API at
  submission; the UI preview is not authoritative.
- [ ] Handle changed odds by refreshing the market and asking the player to
  review and confirm the new price.
- [ ] Prevent duplicate submissions while a request is in progress.
- [ ] Show clear success, validation, authentication, insufficient-balance,
  closed-draw, stale-odds, and service-error states.
- [ ] After acceptance, refresh the balance and bet history and show the
  accepted bet details.

## 4. Wallet and account states

- [ ] Make the unauthenticated state understandable and offer wallet sign-in.
- [ ] Explain that signing in authenticates the wallet; bet submission spends
  SIM credits.
- [ ] Show the authenticated wallet address and SIM balance.
- [ ] Make bet history accessible, including draw number, stake, selected
  outcome/numbers, status, and settlement payout.
- [ ] Handle expired sessions and disconnected wallets without losing a
  confirmed bet's outcome.
- [ ] Do not promise a signup bonus or a way to buy credits unless the live
  product/API actually provides it.

## 5. Draw lifecycle and results

- [ ] Keep current draw status and close time synchronized with `GET
  /draws/current`.
- [ ] Clearly distinguish open, closed, drawing, and settled states.
- [ ] Show the latest completed result and link to `/tv` for full results and
  statistics.
- [ ] Refresh authoritative state after reconnecting or returning to the tab.
- [ ] Do not present hot/delayed-number statistics as predictions or improved
  odds.

## 6. Visual design and responsive behavior

- [ ] Establish a visual direction and approve a small-screen and desktop
  layout before implementing the page.
- [ ] Prioritize the chosen game, current draw, and next player action; keep
  secondary information visually subordinate.
- [ ] Use a consistent type scale, spacing system, colors, button hierarchy,
  and selection states.
- [ ] Make selected, disabled, loading, error, and success states visually
  distinct.
- [ ] Ensure the number selector and bet slip work on narrow mobile screens
  without horizontal scrolling.
- [ ] Make tap targets comfortable on touch screens and preserve usable
  keyboard navigation on desktop.
- [ ] Avoid relying on color alone to communicate a selection or outcome.
- [ ] Keep reduced-motion preferences and contrast in mind.

## 7. Accessibility and content

- [ ] Use semantic headings, buttons, forms, labels, and live status
  announcements.
- [ ] Provide accessible names for number balls and color choices.
- [ ] Keep focus visible and manage focus correctly in confirmation dialogs.
- [ ] Announce validation and submission results to assistive technology.
- [ ] Use concise, consistent terms for stake, odds, gross return, draw, and
  settlement.

## 8. Implementation and verification

- [ ] Reuse the existing API types and functions in `frontend/src/lib/api.ts`
  where they match the design.
- [ ] Reuse game/bet rules from the backend; do not duplicate pricing or
  settlement logic in the browser.
- [ ] Keep the TV page functional and unchanged while adding the game route.
- [ ] Do not reuse the removed lobby styling or old betting-page CSS as the
  design foundation.
- [ ] Test every market type, including boundaries (sum 122/123, 120/121,
  170/171), black ball 49, exact counts, and Pick Six with/without 49.
- [ ] Test draw closure, stale odds, insufficient balance, expired wallet
  session, API errors, retry, and duplicate-submit behavior.
- [ ] Verify keyboard, screen-reader status, mobile, tablet, and desktop
  layouts.
- [ ] Run frontend lint, type-check, and relevant API/settlement tests.
