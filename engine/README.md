# Draw engine

Independent process boundary for persisted draw scheduling, state transitions,
result generation, statistics, and result publication.

The scheduler checks the oldest unfinished draw every three seconds. A round
opens for four minutes, closes betting, waits 30 seconds, then atomically
persists six generated balls and their statistics before publishing the
completed result. If no unfinished draw exists, the engine creates the next
draw (starting at 10001 when draw history is empty).

The engine uses PostgreSQL advisory transaction locks for draw creation and
result generation. The health endpoint is available at
`http://127.0.0.1:4100/health/live`.
