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

# Copy workspace manifests first for better layer caching
COPY package*.json ./
COPY packages/crypto/package.json ./packages/crypto/package.json
COPY apps/worker/package.json ./apps/worker/package.json

# Install all workspace deps (includes @clearfin/crypto resolution)
RUN npm install --workspace=apps/worker

# Copy source after install to avoid cache busting on code-only changes
COPY packages/crypto ./packages/crypto
COPY apps/worker ./apps/worker

WORKDIR /app/apps/worker

EXPOSE 10000

# Run as non-root for security
USER node

CMD ["node", "--loader", "tsx", "src/index.ts"]
