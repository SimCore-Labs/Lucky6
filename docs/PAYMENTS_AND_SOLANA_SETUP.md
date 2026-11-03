# Lucky6 SOL credit payments

## Payment flow

Lucky6 credits are off-chain ledger balances; SOL is the payment rail. A
wallet-authenticated player requests a server-priced order for 100 to 100,000
credits. The backend stores the expected lamports, authenticated wallet, unique
reference, creation time, and 15-minute expiry. The browser asks the same
wallet to sign one native SOL transfer to the configured treasury and includes
the order reference as a read-only account on that transfer instruction.

The payment worker reconciles active orders every five seconds. It verifies
finalized transactions on Solana Mainnet or Devnet, including the expected payer
signature, unique order reference, one exact payer-to-treasury transfer, and
the order time window, with up to two minutes allowed for finalization after
the quoted expiry. It also scans the reference account so a payment can still
be found if the browser closes before its signature reaches the API.
Only an exact successful transfer is credited. Underpayments, overpayments,
failed transactions, and mismatches are not credited automatically.

On `/top-up`, the player connects and authenticates a wallet before creating an
order. Continue opens a review dialog with the locked SOL amount and expiry
countdown; Pay requests the wallet signature. The dialog stays locked only
while the wallet is responding, then the frontend submits the signature and
polls the order until the worker credits it or reports a terminal status.

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
  public treasury address, and the Solana RPC endpoints.
- `frontend/.env.local` supplies `NEXT_PUBLIC_API_URL` and
  `NEXT_PUBLIC_SOLANA_RPC_URL`; set `NEXT_PUBLIC_SOLANA_NETWORK=devnet` to
  start the UI on Devnet. The public RPC values are exposed to browsers; do
  not put a private RPC credential in a `NEXT_PUBLIC_` variable.

The header network selector reconnects the wallet against the selected
cluster. The payment worker can verify Mainnet and Devnet orders at the same
time; it discovers the transaction on-chain and validates it against that
network's genesis hash. Orders are not bound to a cluster in the database; the
worker identifies the cluster from the submitted transaction or unique
reference. Configure `SOLANA_MAINNET_RPC_URL` and `SOLANA_DEVNET_RPC_URL` in
the worker's runtime environment. On EC2, PM2 loads `backend/.env` for the
worker, so configure them there. The legacy
`SOLANA_NETWORK` and `SOLANA_RPC_URL` settings remain supported as a fallback
for the selected network. The frontend can use
`NEXT_PUBLIC_SOLANA_DEVNET_RPC_URL` for its Devnet RPC.

Both networks currently credit the same wallet ledger and use the configured
`TREASURY_WALLET_ADDRESS`. Solana addresses are cluster-independent, but Devnet
SOL is test-only and must not be treated as real funds. Keep Devnet use limited
to authorized testing while it shares the production ledger.

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
