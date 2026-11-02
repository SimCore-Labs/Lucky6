# Settlement worker

Independent NestJS process that consumes completed-draw events, polls pending
draws as a fallback, evaluates accepted bets, records settlement rows, and
credits winning payouts to the wallet ledger.

The worker supports:

- Single-selection markets evaluated by
  `src/domain/settlement-evaluator.service.ts`.
- `PICK_NUMBERS_APPEAR` tickets, which win only when every selected number
  appears.
- `PICK_NUMBERS_ABSENT` tickets, which win only when none of the selected
  numbers appears.
- Legacy `PICK_SIX` tier tickets already accepted under the former rules.

Each ordinary or number-pick bet represents one selection/ticket. Rainbow
outcomes must be submitted and settled as independent bets; the worker does
not calculate parlay odds.

The workspace has a typecheck script but no dedicated test script configured.
Add and run evaluator tests before enabling the new markets in a deployed
environment. See `docs/DEVELOPMENT_HANDOFF.md` before applying Turso
migrations or deploying the worker.
