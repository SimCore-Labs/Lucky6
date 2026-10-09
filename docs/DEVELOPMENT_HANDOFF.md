# Lucky6 Deployment & Development Handoff

**Updated:** October 2026
**Repository:** `[Your GitHub Repo]`

## 1. Architecture Overview
Lucky6 is a Web3-enabled real-time game architecture utilizing a monorepo structure. The system consists of:
- **`@lucky-six/backend`**: Fastify NestJS API handling Web3 wallet authentication, bet placements, dynamic odds calculation, and serving active draws.
- **`@lucky-six/engine`**: Background scheduler driving the deterministic 6-ball draw logic on a strict 5-minute interval.
- **`@lucky-six/settlement`**: Background worker that evaluates winning/losing bets post-draw and updates ledgers.
- **`@lucky-six/payment-worker`**: Solana Web3 monitor that verifies on-chain SOL payments via CoinGecko pricing and issues SIM credits.
- **`@lucky-six/frontend`**: Next.js 16 App Router UI. *(Recommended: Host separately on Vercel)*

## 2. Server Access (AWS EC2)

The live backend runs on an Ubuntu EC2 instance (`t3.small`) in the `eu-north-1` region.
- **Public IP:** `16.16.90.151`
- **Public DNS:** `ec2-16-16-90-151.eu-north-1.compute.amazonaws.com`
- **User:** `ubuntu`
- **SSH Key:** `wesheild.pem`

### Connecting via SSH (Local Machine)
From your local Windows PowerShell, connect using the private key:
```powershell
ssh -i C:\path\to\wesheild.pem ubuntu@16.16.90.151
```
*Note: Ensure your `.pem` file permissions are restricted, otherwise SSH will reject it.*

## 3. GitHub Actions Continuous Deployment (CI/CD)

The deployment workflow currently exists as `.github/workflows/deploy.yml.disabled` and does not run. Manual deployments should update the backend services only; keep the Next.js frontend on Vercel.

**Required GitHub Secrets:**
Go to your GitHub repository -> **Settings** -> **Secrets and variables** -> **Actions** -> **New repository secret**.
Add the following:
1. `EC2_HOST`: `16.16.90.151`
2. `EC2_SSH_KEY`: The **entire contents** of your `wesheild.pem` file (including `-----BEGIN RSA PRIVATE KEY-----` and `-----END RSA PRIVATE KEY-----`).

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

The active deployment checkout is `~/Lucky6-deploy`; it was created to preserve the pre-existing `~/Lucky6` checkout and its local lockfile change. These commands do not build or run the frontend. Configure `backend/.env` with production `DATABASE_URL`, `REDIS_URL`, `CORS_ORIGIN`, `SOLANA_RPC_URL`, and `TREASURY_WALLET_ADDRESS` before starting services. Set `CORS_ORIGIN` to the exact Vercel origin (no trailing slash). For local frontend development against the deployed API, add `http://localhost:3000` as a comma-separated second origin. The PM2 ecosystem loads that file for each backend process; restart `lucky6-backend` after changing it.

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

**Database safety:** Do not use `npm run start:prod --workspace=backend` on production; that script runs `prisma db push --accept-data-loss` and seeds the database on every start. Review and apply a deliberate production database migration separately before starting services. The payment worker uses the configured Solana RPC and treasury public address; do not put wallet signing secrets in this environment or in the API/frontend.

## 5. Domain & Nginx Configuration (luckyapi.muizdev.xyz)

To assign `luckyapi.muizdev.xyz` to the backend on EC2, install Nginx and Certbot on the Ubuntu machine.

1. **DNS Setup:** In your domain provider (e.g., Cloudflare, Namecheap), point an `A` record for `luckyapi.muizdev.xyz` to the EC2 Public IP: `16.16.90.151`.
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
