# Payment worker

Independent process boundary for Solana payment verification and crediting.

This workspace currently provides a local liveness endpoint at
`http://127.0.0.1:4300/health/live` only. It does not connect to Solana or
credit accounts. Network, treasury, price quoting, and verification/finality
rules must be explicitly configured before payment processing is enabled.
