# Draw engine

Independent process boundary for persisted draw scheduling, state transitions,
result generation, statistics, and result publication.

This workspace currently provides a local liveness endpoint at
`http://127.0.0.1:4100/health/live` only. No draws are scheduled or generated.
The probability/rules configuration and persistent state transitions must be
defined and tested before enabling draw processing.
