FROM node:22-slim

# Install Chromium and fonts for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    fonts-noto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY apps/worker/package.json ./apps/worker/package.json
COPY apps/worker/patches ./apps/worker/patches

RUN npm install --workspace=apps/worker

COPY packages/crypto ./packages/crypto
COPY apps/worker ./apps/worker

# Patch israeli-bank-scrapers: fix Max post-login URL change
RUN node apps/worker/scripts/patch-max.cjs

WORKDIR /app/apps/worker

# Bundle everything into one JS file — fast startup, no module resolution issues
RUN /app/node_modules/.bin/esbuild src/index.ts \
    --bundle \
    --platform=node \
    --target=node22 \
    --outfile=dist/index.js \
    --external:israeli-bank-scrapers \
    --external:puppeteer \
    --external:@supabase/supabase-js \
    --external:@upstash/redis \
    --external:node-cron \
    --format=esm

EXPOSE 10000

USER node

CMD ["node", "dist/index.js"]
