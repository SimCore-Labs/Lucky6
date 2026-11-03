# Lucky6 Deployment & Development Handoff

**Updated:** November 3, 2026
**Repository:** `SimCore-Labs/Lucky6`

## 1. Architecture Overview
Lucky6 is a Web3-enabled real-time game architecture utilizing a monorepo structure. The system consists of:
- **`@lucky-six/backend`**: Fastify NestJS API handling Web3 wallet authentication, bet placements, dynamic odds calculation, and serving active draws.
- **`@lucky-six/engine`**: Background scheduler driving the deterministic 6-ball draw logic on a strict 5-minute interval.
- **`@lucky-six/settlement`**: Background worker that evaluates winning/losing bets post-draw and updates ledgers.
- **`@lucky-six/payment-worker`**: Solana Web3 monitor that verifies on-chain SOL payments via CoinGecko pricing and issues SIM credits.
- **`@lucky-six/frontend`**: Next.js 16 App Router UI. *(Recommended: Host separately on Vercel)*

## 2. Server Access (AWS EC2)

The live backend runs on the `Lucky6-API-Production` EC2 instance.
- **Instance ID:** `i-01ea01931b684d075`
- **Region:** `eu-north-1` (Europe/Stockholm)
- **Availability Zone:** `eu-north-1a`
- **Instance type:** `t3.small`
- **Operating system:** Ubuntu 24.04
- **Runtime:** Node.js `v24.22.1`, PM2 `7.1.1`
- **Public IP:** `16.170.92.0`
- **Elastic IP allocation:** `eipalloc-0a48f334dcea9269e` (associated with this instance)
- **Public DNS:** `ec2-16-170-92-0.eu-north-1.compute.amazonaws.com`
- **User:** `ubuntu`
- **EC2 key pair:** `wesheild`
- **Local SSH key:** `$HOME/Downloads/wesheild.pem` (verified mode `600`)
- **Deployment checkout:** `/home/ubuntu/Lucky6-deploy`
- **Security group:** `sg-057a93e7148801470`

The IP, DNS, and Elastic IP association above were verified on November 3,
2026. The Elastic IP is assigned to this instance; check its current
association in AWS if connectivity or DNS stops working. The previously
documented `16.16.90.151` address is stale.

### Connecting via SSH (Linux or macOS)

From the development machine where the key is stored in Downloads:

```bash
chmod 600 "$HOME/Downloads/wesheild.pem"
ssh -i "$HOME/Downloads/wesheild.pem" ubuntu@ec2-16-170-92-0.eu-north-1.compute.amazonaws.com
```

The instance security group currently permits inbound SSH (TCP port 22) from
`0.0.0.0/0`. Restrict this to the administrator's current public IP when
practical. Never copy the private key into the repository or onto the EC2
instance.

## 3. Deployment workflow status

There is no tracked `.github/workflows/deploy.yml` in this repository, so the
GitHub Actions deployment described in earlier handoff notes is not available
from this checkout. The documented deployment target is EC2 with PM2 (section
4). A workflow must be added and its credentials configured before automated
GitHub deployment can be used. Do not assume it applies database migrations:
Turso schema SQL must be applied separately with the authenticated Turso CLI.

## 4. EC2 Installation and PM2 Process Management

The EC2 host needs Node.js 24+, npm, PM2, and Redis. Install only the backend workspaces and their shared contracts from the monorepo root:

```bash
cd ~/Lucky6-deploy
npm ci --workspace=@lucky-six/contracts --workspace=backend --workspace=engine --workspace=settlement --workspace=payment-worker
npm run build --workspace=@lucky-six/contracts
npm run build --workspace=backend
npm run build --workspace=engine
npm run build --workspace=settlement
npm run build --workspace=payment-worker
```

The active deployment checkout is `~/Lucky6-deploy`; it was created to preserve the pre-existing `~/Lucky6` checkout and its local lockfile change. These commands do not build or run the frontend. Configure `backend/.env` with the production Turso `DATABASE_URL` (`libsql://...`), `TURSO_AUTH_TOKEN`, `REDIS_URL`, `CORS_ORIGIN`, `SOLANA_RPC_URL`, and `TREASURY_WALLET_ADDRESS` before starting services. `CORS_ORIGIN` is a comma-separated list of exact origins with no trailing slashes. As of November 3, 2026, the deployed value includes:

```text
https://lucky6ix.vercel.app,http://localhost:3000,http://192.168.100.242:3000
```

The LAN origin is for temporary local development and must be updated if the
developer machine's address changes; remove it when it is no longer needed.
The PM2 ecosystem loads `backend/.env` for each process. After changing only
`CORS_ORIGIN`, restart the API with `pm2 restart lucky6-backend --update-env`;
restart workers when their database or Redis configuration changes.

Start the API and backend workers with:

```bash
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

To view their live logs:

```bash
pm2 logs lucky6-backend lucky6-engine lucky6-settlement lucky6-payment-worker
```

**Database safety:** Generate and review Prisma migrations against the local SQLite database, then apply the migration SQL with the authenticated Turso CLI before starting services. Prisma's normal remote PostgreSQL migration flow is not used. `start:prod` does not push a schema or seed records; run the explicit seed command only when needed. Keep the historical PostgreSQL migrations untouched under `backend/prisma/migrations`. The payment worker uses the configured Solana RPC and treasury public address; do not put wallet signing secrets in this environment or in the API/frontend.

For the explicitly approved one-time pre-launch reset, first stop all services
with `pm2 stop lucky6-backend lucky6-engine lucky6-settlement lucky6-payment-worker`.
Then, from `~/Lucky6-deploy`, apply migrations and run
`npm run db:reset-draw-data --workspace=backend -- --confirm-reset-draw-data --services-stopped`.
Restart the four PM2 services and run `pm2 save`. The reset preserves wallets,
balances, payments, and ledger entries.

## 5. Domain & Nginx Configuration (luckyapi.muizdev.xyz)

To assign `luckyapi.muizdev.xyz` to the backend on EC2, install Nginx and Certbot on the Ubuntu machine.

1. **DNS Setup:** Point the `A` record for `luckyapi.muizdev.xyz` to the assigned Elastic IP: `16.170.92.0`.
2. **Nginx Setup on EC2:**
```bash
sudo apt update
sudo apt install nginx
```
3. **Nginx Config (`/etc/nginx/sites-available/luckyapi`):**
```nginx
server {
    listen 80;
    server_name luckyapi.muizdev.xyz;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        # Real IP Forwarding
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```
4. **Enable and Secure (SSL):**
```bash
sudo ln -s /etc/nginx/sites-available/luckyapi /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d luckyapi.muizdev.xyz
```

## 6. Frontend Hosting Strategy

**Do not host the Next.js frontend on the EC2 machine.**
- Import the repository into **Vercel** and set the project Root Directory to `frontend`. Vercel builds and hosts that workspace separately; the EC2 PM2 configuration does not include it.
- **Why?** Next.js App Router relies heavily on Edge caching, CDN distribution, and optimized serverless image rendering. Vercel provides this out of the box globally. Putting it on a single `t3.small` EC2 instance next to four heavy backend node processes will severely limit frontend performance, cause memory exhaustion, and slow down your players' WebSocket connections.
- **Setup:** Connect your GitHub repo to Vercel, set the Root Directory to `frontend`, and configure your environment variable `NEXT_PUBLIC_API_URL=https://luckyapi.muizdev.xyz`.
