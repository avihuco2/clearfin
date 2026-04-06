#!/bin/bash
# Run this on the EC2 via SSM when the instance was created before user-data.sh
# had PostgreSQL support, or to refresh the .env from Secrets Manager.
# Idempotent — safe to run multiple times.
set -euo pipefail

REGION="il-central-1"
SECRET_NAME="clearfin/app"
APP_DIR="/opt/clearfin"
APP_USER="clearfin"

echo "=== ClearFin EC2 bootstrap ==="

# ---------------------------------------------------------------------------
# PostgreSQL 16 — install if not already present
# ---------------------------------------------------------------------------
if ! command -v psql &>/dev/null; then
  echo "Installing PostgreSQL 16..."
  dnf install -y postgresql16-server postgresql16

  postgresql-setup --initdb

  # Listen only on loopback
  sed -i "s/#listen_addresses = 'localhost'/listen_addresses = 'localhost'/" \
    /var/lib/pgsql/data/postgresql.conf

  # Allow local password auth (change default ident to scram-sha-256, then add clearfin rule)
  sed -i "s/^host    all             all             127.0.0.1\/32            ident/host    all             all             127.0.0.1\/32            scram-sha-256/" /var/lib/pgsql/data/pg_hba.conf
  echo "host    clearfin    clearfin    127.0.0.1/32    scram-sha-256" \
    >> /var/lib/pgsql/data/pg_hba.conf

  systemctl enable postgresql
  systemctl start postgresql
else
  echo "PostgreSQL already installed, ensuring it's running..."
  systemctl start postgresql || true
fi

# Create DB user and database (idempotent)
sudo -u postgres psql -c "CREATE USER clearfin WITH LOGIN;" 2>/dev/null || true
sudo -u postgres psql -c "CREATE DATABASE clearfin OWNER clearfin;" 2>/dev/null || true

# ---------------------------------------------------------------------------
# Fetch secrets from Secrets Manager and write .env
# ---------------------------------------------------------------------------
echo "Fetching secrets from Secrets Manager..."
SECRET_JSON=$(aws secretsmanager get-secret-value \
  --region "$REGION" \
  --secret-id "$SECRET_NAME" \
  --query SecretString \
  --output text)

ENV_FILE="$APP_DIR/.env"
mkdir -p "$APP_DIR"
echo "$SECRET_JSON" | jq -r 'to_entries[] | "\(.key)=\(.value)"' > "$ENV_FILE"
echo "PUPPETEER_EXECUTABLE_PATH=/usr/bin/google-chrome-stable" >> "$ENV_FILE"
echo "NODE_ENV=production" >> "$ENV_FILE"
chown "$APP_USER:$APP_USER" "$ENV_FILE"
chmod 600 "$ENV_FILE"
echo ".env written to $ENV_FILE"

# ---------------------------------------------------------------------------
# Set PostgreSQL password from secrets
# ---------------------------------------------------------------------------
DB_PASSWORD=$(echo "$SECRET_JSON" | jq -r '.DB_PASSWORD')
sudo -u postgres psql -c "ALTER USER clearfin WITH PASSWORD '${DB_PASSWORD}';"
echo "PostgreSQL password updated"

# ---------------------------------------------------------------------------
# Ensure PM2 ecosystem file is present
# ---------------------------------------------------------------------------
if [ ! -f "$APP_DIR/ecosystem.config.cjs" ]; then
cat > "$APP_DIR/ecosystem.config.cjs" << 'PM2'
module.exports = {
  apps: [
    {
      name: 'clearfin-web',
      cwd: '/opt/clearfin/apps/web',
      script: 'node',
      args: '--env-file=/opt/clearfin/.env .next/standalone/apps/web/server.js',
      env: { PORT: 3000, HOSTNAME: '0.0.0.0' },
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
echo "ecosystem.config.cjs written"
fi

echo "=== Bootstrap complete ==="
