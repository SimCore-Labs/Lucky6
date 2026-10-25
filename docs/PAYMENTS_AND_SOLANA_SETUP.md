# Lucky6 SOL credit payments

## Payment flow

Lucky6 credits are off-chain ledger balances; SOL is the payment rail. A
wallet-authenticated player requests a server-priced order for 100 to 100,000
credits. The backend stores the expected lamports, authenticated wallet, unique
reference, creation time, and 15-minute expiry. The browser asks the same
wallet to sign one native SOL transfer to the configured treasury and includes
the order reference as a read-only account on that transfer instruction.

The payment worker reconciles active orders every five seconds. It verifies
finalized transactions on Solana mainnet, including the expected payer
signature, unique order reference, one exact payer-to-treasury transfer, and
the order time window, with up to two minutes allowed for finalization after
the quoted expiry. It also scans the reference account so a payment can still
be found if the browser closes before its signature reaches the API.
Only an exact successful transfer is credited. Underpayments, overpayments,
failed transactions, and mismatches are not credited automatically.

Credit balance, ledger entry, and order status are committed in one database
transaction. The ledger is authoritative; the browser never supplies its own
credit amount, SOL price, network, or treasury destination. A treasury private
key is never needed by Lucky6: players sign from their own wallet, and the
application only needs the treasury's public address.

## Local configuration

Copy the examples to local `.env` files and fill in the application's existing
database, Redis, and treasury settings. Never commit `.env` files or put a
wallet private key or seed phrase in them.

- `backend/.env` supplies the backend database/Turso settings and the public
  treasury address.
- `payment-worker/.env` supplies the same database/Turso settings, Redis,
  public treasury address, and the worker RPC endpoint.
- `frontend/.env.local` supplies `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_SOLANA_RPC_URL`. The public RPC value is exposed to browsers;
  do not put a private RPC credential in a `NEXT_PUBLIC_` variable.

The frontend wallet signer and the payment worker are mainnet-only. The worker
checks its RPC genesis hash before scanning or verifying payments, so pointing
it at devnet or another cluster fails closed. The frontend RPC can use a
different provider, but it must also serve mainnet. A paid test transaction
uses real SOL; validate UI and order creation without submitting a payment
first.

The worker imports `.env` from its working directory at startup. For a local
run, start Redis, apply the backend's database migrations, and configure the
database credentials first. Run the build once, then start each service in a
separate terminal:

```sh
npm run build --workspace=backend
npm run dev:backend
npm run dev:payment-worker
npm run dev:frontend
```

The backend build generates Prisma code consumed by the payment worker. The
root `dev:payment-worker` script builds the shared contracts package before
starting the worker. The worker health check is local to `127.0.0.1:4300` and
is intended for process monitoring, not direct public exposure.

The focused transaction-verification tests can be run with:

```sh
npm test --workspace=payment-worker
```

## Operational limits

The local payment flow is not a production authorization to sell wagerable
credits. There is no automatic refund, manual review console, or dispute
workflow yet. Do not enable real purchases until the configured treasury and
network have been independently verified and the project's legal,
jurisdictional, responsible-play, security, support, and randomness controls
are approved.
