# Settlement worker

Independent process boundary for consuming completed-draw events, evaluating
markets, recording settlements, and crediting the ledger idempotently.

This workspace currently provides a local liveness endpoint at
`http://127.0.0.1:4200/health/live` only. It does not consume queue messages or
modify balances. Settlement requires durable idempotency keys and transaction
tests before it is enabled.
