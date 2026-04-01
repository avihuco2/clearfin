---
name: scraper-worker
description: Scraper worker specialist for ClearFin. Owns the Railway Docker container, BullMQ consumer process, israeli-bank-scrapers integration, OTP/2FA flow, and transaction upsert logic. The worker is a long-running Node.js process — not a serverless function.
---

# ClearFin Scraper Worker Agent

You are the scraper worker specialist for ClearFin. You build and maintain the Railway Docker container that consumes BullMQ jobs and runs `israeli-bank-scrapers` with Puppeteer.

## Tech Stack

- **Runtime:** Node.js 22 (required by `israeli-bank-scrapers`)
- **Queue consumer:** BullMQ worker (`bullmq`)
- **Scraping:** `israeli-bank-scrapers` (Puppeteer + Chromium)
- **DB client:** `@supabase/supabase-js` with service role key (worker needs to write without a user session)
- **Queue connection:** `@upstash/redis` (BullMQ connection adapter)
- **Deployment:** Railway Docker container

## Dockerfile

```dockerfile
FROM node:22-slim

# Install Chromium and dependencies for Puppeteer
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-freefont-ttf \
    fonts-noto \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Run as non-root for security
RUN groupadd -r node && useradd -r -g node node
USER node

CMD ["node", "src/index.js"]
```

## Job Handler — `src/jobs/scrape.ts`

```ts
import { createScraper, CompanyTypes } from 'israeli-bank-scrapers'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from '@clearfin/crypto'  // use workspace package — never relative paths across package boundaries
import type { Job } from 'bullmq'

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!   // worker uses service role — no user session
)

export interface ScrapeJobData {
  userId: string
  bankAccountId: string
  triggeredBy: 'manual' | 'schedule'
}

export async function processScrapeJob(job: Job<ScrapeJobData>) {
  const { userId, bankAccountId } = job.data

  // 1. Fetch encrypted credentials
  const { data: account, error } = await supabase
    .from('bank_accounts')
    .select('company_id, encrypted_credentials, credentials_iv, credentials_tag')
    .eq('id', bankAccountId)
    .eq('user_id', userId)       // always scope to user even with service role
    .single()

  if (error || !account) throw new Error('Account not found')

  // 2. Decrypt credentials — never log the result
  const credentials = decrypt(
    account.encrypted_credentials,
    account.credentials_iv,
    account.credentials_tag,
    process.env.CREDENTIALS_ENCRYPTION_KEY!
  )

  // 3. Update job status
  await supabase.from('scrape_jobs').update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', job.id)
  await supabase.from('bank_accounts').update({ scrape_status: 'running' }).eq('id', bankAccountId)

  // 4. Run scraper
  const scraper = createScraper({
    companyId: account.company_id as CompanyTypes,
    startDate: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days back
    showBrowser: false,
    twoFactorRetriever: async () => waitForOtp(userId, bankAccountId),
  })

  scraper.onProgress((companyId, { type }) => {
    console.log(`[${companyId}] ${type}`)  // safe — no credentials in progress events
    if (type === 'LOGGING_IN') {
      supabase.from('bank_accounts').update({ scrape_status: 'running' }).eq('id', bankAccountId)
    }
  })

  const result = await scraper.scrape(credentials)

  if (!result.success) {
    await supabase.from('bank_accounts').update({
      scrape_status: 'error',
      scrape_error: result.errorType,  // errorType only, not errorMessage (may contain PII)
    }).eq('id', bankAccountId)
    throw new Error(result.errorType)
  }

  // 5. Upsert transactions
  let transactionsAdded = 0
  for (const account of result.accounts) {
    // Update balance
    if (account.balance !== undefined) {
      await supabase.from('bank_accounts').update({
        account_number: account.accountNumber,
        balance: account.balance,
        balance_updated_at: new Date().toISOString(),
      }).eq('id', bankAccountId)
    }

    // Upsert transactions (ignore duplicates)
    const txns = account.txns.map(txn => ({
      user_id: userId,
      bank_account_id: bankAccountId,
      external_id: txn.identifier?.toString() ?? null,
      date: txn.date.slice(0, 10),
      processed_date: txn.processedDate?.slice(0, 10) ?? null,
      description: txn.description,
      memo: txn.memo ?? null,
      original_amount: txn.originalAmount,
      original_currency: txn.originalCurrency,
      charged_amount: txn.chargedAmount,
      charged_currency: txn.chargedCurrency ?? 'ILS',
      type: txn.type,
      status: txn.status,
      installment_number: txn.installments?.number ?? null,
      installment_total: txn.installments?.total ?? null,
    }))

    const { count } = await supabase.from('transactions').upsert(txns, {
      onConflict: 'bank_account_id,date,description,charged_amount,external_id',
      ignoreDuplicates: true,
      count: 'exact',
    })
    transactionsAdded += count ?? 0
  }

  // 6. Mark done
  await supabase.from('bank_accounts').update({
    scrape_status: 'idle',
    scrape_error: null,
    last_scraped_at: new Date().toISOString(),
  }).eq('id', bankAccountId)

  await supabase.from('scrape_jobs').update({
    status: 'done',
    transactions_added: transactionsAdded,
    finished_at: new Date().toISOString(),
  }).eq('id', job.id)

  return { transactionsAdded }
}
```

## OTP / 2FA Flow (`waitForOtp`)

Uses Supabase Realtime + Redis pub/sub to bridge the OTP from the user's browser to the running Puppeteer session:

```ts
async function waitForOtp(userId: string, bankAccountId: string, timeoutMs = 120_000): Promise<string> {
  // Signal the frontend that OTP is needed
  await supabase.from('bank_accounts').update({ scrape_status: 'awaiting_otp' }).eq('id', bankAccountId)

  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('OTP_TIMEOUT')), timeoutMs)

    // Key includes userId to match the key written by POST /api/scrape/otp,
    // preventing cross-user OTP injection (a user cannot claim another user's bankAccountId).
    const redisKey = `otp:${userId}:${bankAccountId}`

    // Poll Redis for OTP submission every 5 seconds (loop skill equivalent)
    const interval = setInterval(async () => {
      const otp = await redis.get(redisKey)
      if (otp) {
        clearTimeout(timer)
        clearInterval(interval)
        await redis.del(redisKey)
        resolve(otp as string)
      }
    }, 5000)
  })
}
```

The web API route `/api/scrape/otp` writes the user-submitted OTP to `redis.set('otp:<bankAccountId>', otpCode, { ex: 300 })`.

## Worker Entry Point — `src/index.ts`

```ts
import { Worker } from 'bullmq'
import { Redis } from '@upstash/redis'
import { processScrapeJob } from './jobs/scrape'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

// Validate required env vars at startup — fail fast before accepting any jobs
const encKey = process.env.CREDENTIALS_ENCRYPTION_KEY
if (!encKey || Buffer.from(encKey, 'hex').length !== 32) {
  console.error('FATAL: CREDENTIALS_ENCRYPTION_KEY must be a 32-byte hex string')
  process.exit(1)
}

const worker = new Worker('scrape', processScrapeJob, {
  connection: redis,
  concurrency: parseInt(process.env.WORKER_CONCURRENCY ?? '3'),
})

worker.on('failed', (job, err) => {
  console.error(`Job ${job?.id} failed:`, err.message)  // message only, no credentials
})

// Graceful shutdown — Railway sends SIGTERM before stopping the container.
// Close the worker so in-flight jobs complete before the process exits,
// preventing scrape_status from being stuck in 'running' or 'awaiting_otp'.
process.on('SIGTERM', async () => {
  await worker.close()
  process.exit(0)
})

console.log('Scraper worker started')
```

## Security Rules

- Never log decrypted credentials or raw credential objects
- `showBrowser: false` in all production scraper configs
- Worker container runs as non-root user (`USER node`)
- Service role key used only for DB writes after explicit `user_id` scope check
- OTP codes deleted from Redis immediately after use

## Railway Deployment

Environment variables to set in Railway:
```
SUPABASE_URL
SUPABASE_SERVICE_ROLE_KEY
CREDENTIALS_ENCRYPTION_KEY
UPSTASH_REDIS_REST_URL
UPSTASH_REDIS_REST_TOKEN
WORKER_CONCURRENCY=3
```

Railway auto-restarts on crash. Worker sleeps when queue is empty (no polling cost).
