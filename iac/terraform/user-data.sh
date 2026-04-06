#!/bin/bash
# ClearFin EC2 bootstrap — Amazon Linux 2023 / il-central-1
# Runs once on first boot via EC2 user-data.
set -euo pipefail
exec > >(tee /var/log/clearfin-bootstrap.log | logger -t clearfin-bootstrap) 2>&1

REGION="il-central-1"
SECRET_NAME="clearfin/app"
APP_DIR="/opt/clearfin"
APP_USER="clearfin"

echo "=== ClearFin bootstrap started ==="

# ---------------------------------------------------------------------------
# System packages
# ---------------------------------------------------------------------------
dnf update -y
dnf install -y \
  git \
  nginx \
  jq \
  aws-cli \
  nss \
  atk \
  cups-libs \
  libdrm \
  libXcomposite \
  libXdamage \
  libXfixes \
  libXrandr \
  libgbm \
  pango \
  alsa-lib \
  liberation-fonts \
  xdg-utils

# Google Chrome (Chromium is not in AL2023 repos)
rpm --import https://dl.google.com/linux/linux_signing_key.pub
cat > /etc/yum.repos.d/google-chrome.repo << 'CHROME'
[google-chrome]
name=google-chrome
baseurl=https://dl.google.com/linux/chrome/rpm/stable/x86_64
enabled=1
gpgcheck=1
gpgkey=https://dl.google.com/linux/linux_signing_key.pub
CHROME
dnf install -y google-chrome-stable

# ---------------------------------------------------------------------------
# Node.js 22 via NodeSource
# ---------------------------------------------------------------------------
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

# ---------------------------------------------------------------------------
# PM2 (global)
# ---------------------------------------------------------------------------
npm install -g pm2

# ---------------------------------------------------------------------------
# App user
# ---------------------------------------------------------------------------
useradd -r -m -d "$APP_DIR" -s /sbin/nologin "$APP_USER" || true

# ---------------------------------------------------------------------------
# Fetch secrets from Secrets Manager (via PrivateLink — no internet needed)
# ---------------------------------------------------------------------------
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --region "$REGION" \
  --secret-id "$SECRET_NAME" \
  --query SecretString \
  --output text)

# Write .env file for the app (owned by clearfin user, mode 600)
ENV_FILE="$APP_DIR/.env"
echo "$SECRET_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value)"' > "$ENV_FILE"
echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable" >> "$ENV_FILE"
echo "NODE_ENV=production" >> "$ENV_FILE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"

# ---------------------------------------------------------------------------
# Nginx reverse proxy (port 80 → app port 3000)
# ---------------------------------------------------------------------------
cat > /etc/nginx/conf.d/clearfin.conf << 'NGINX'
server {
    listen 80 default_server;
    server_name _;

    # Health check endpoint — ALB uses this
    location /api/health {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Host $host;
        access_log         off;
    }

    location / {
        proxy_pass         http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header   Upgrade $http_upgrade;
        proxy_set_header   Connection 'upgrade';
        proxy_set_header   Host $host;
        proxy_set_header   X-Real-IP $remote_addr;
        proxy_set_header   X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header   X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        proxy_read_timeout 120s;
    }
}
NGINX

systemctl enable nginx
systemctl start nginx

# ---------------------------------------------------------------------------
# App directory structure (populated by GitHub Actions deploy)
# ---------------------------------------------------------------------------
mkdir -p "$APP_DIR"
chown "$APP_USER:$APP_USER" "$APP_DIR"

# ---------------------------------------------------------------------------
# PM2 ecosystem file
# ---------------------------------------------------------------------------
cat > "$APP_DIR/ecosystem.config.cjs" << 'PM2'
module.exports = {
  apps: [
    {
      name: 'clearfin-web',
      cwd: '/opt/clearfin/apps/web',
      script: 'node',
      args: '--env-file=/opt/clearfin/.env .next/standalone/server.js',
      env: {
        PORT: 3000,
        HOSTNAME: '0.0.0.0',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '800M',
    },
    {
      name: 'clearfin-worker',
      cwd: '/opt/clearfin/apps/worker',
      script: 'node',
      args: '--env-file=/opt/clearfin/.env bundle/index.mjs',
      env: {
        NODE_ENV: 'production',
        PUPPETEER_EXECUTABLE_PATH: '/usr/bin/google-chrome-stable',
      },
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
    },
  ],
}
PM2

chown "$APP_USER:$APP_USER" "$APP_DIR/ecosystem.config.cjs"

# ---------------------------------------------------------------------------
# Enable PM2 on reboot (runs as root, starts apps as clearfin user)
# ---------------------------------------------------------------------------
env PATH=$PATH:/usr/bin pm2 startup systemd -u "$APP_USER" --hp "$APP_DIR" || true

echo "=== Bootstrap complete. GitHub Actions will deploy the app. ==="
