# StockAisle EC2 Deployment

This setup deploys from `master` to:

- Frontend EC2 (nginx): `44.199.208.137` (`172.31.5.124`)
- Backend EC2 (node): `100.29.186.186` (`172.31.0.139`)

Both instances are in the same VPC, so nginx can proxy API traffic to backend private IP.

## 1) Backend env (`~/ecom/backend/.env`)

Set production-safe values:

```env
NODE_ENV=production
PORT=4000
DATABASE_URL=postgres://...
JWT_SECRET=...
ACCESS_TOKEN_TTL=15m
REFRESH_TOKEN_TTL=7d
CORS_ORIGIN=http://44.199.208.137,https://stockaisle.com
CONVERSATIONAL_ENGINE_URL=http://localhost:8000
RESERVATION_TTL_MIN=30
S3_REGION=...
S3_BUCKET=...
S3_PUBLIC_BASE_URL=...
```

`CORS_ORIGIN` now supports comma-separated origins.

## 2) Backend process manager (recommended: `systemd`)

Check what is already running:

```bash
pm2 list
systemctl status stockaisle-backend
systemctl list-units --type=service | grep -i stockaisle
```

Install service (if not present):

```bash
cd ~/ecom
sudo cp ops/systemd/stockaisle-backend.service /etc/systemd/system/stockaisle-backend.service
sudo systemctl daemon-reload
sudo systemctl enable stockaisle-backend
sudo systemctl restart stockaisle-backend
sudo systemctl status stockaisle-backend --no-pager
```

## 3) Frontend nginx config (`44.199.208.137`)

Use the repo template:

```bash
cd ~/ecom
sudo cp ops/nginx/stockaisle-admin.conf /etc/nginx/sites-available/stockaisle-admin
sudo ln -sf /etc/nginx/sites-available/stockaisle-admin /etc/nginx/sites-enabled/stockaisle-admin
sudo nginx -t
sudo systemctl reload nginx
```

This serves the static admin app and proxies `/api/*` to `172.31.0.139:4000`.

## 4) SSL check and setup status

Check current SSL state:

```bash
sudo nginx -T | grep -E "listen 443|ssl_certificate|server_name"
sudo certbot certificates
```

After DNS points to frontend EC2, enable SSL:

```bash
sudo certbot --nginx -d stockaisle.com -d www.stockaisle.com
```

Verify:

```bash
curl -I https://stockaisle.com
openssl s_client -connect stockaisle.com:443 -servername stockaisle.com
```

## 5) GitHub Actions auto-deploy on push to `master`

Workflow file: `.github/workflows/deploy-ec2.yml`

Add these GitHub repo secrets:

- `EC2_SSH_PRIVATE_KEY`: private key matching EC2 authorized key
- `EC2_SSH_USER`: `ubuntu`
- `BACKEND_EC2_HOST`: `100.29.186.186`
- `FRONTEND_EC2_HOST`: `44.199.208.137`
- `ADMIN_API_BASE_URL`: `/api`

On every push to `master`, workflow will:

1. SSH backend EC2 and run `scripts/deploy-backend.sh`
2. SSH frontend EC2 and run `scripts/deploy-admin.sh`

## 6) Security group minimum rules

- Backend EC2 inbound:
  - `4000` from frontend EC2 security group (or `172.31.5.124/32` if SG-to-SG not used)
  - `22` from your admin IP
- Frontend EC2 inbound:
  - `80` and `443` from `0.0.0.0/0`
  - `22` from your admin IP
