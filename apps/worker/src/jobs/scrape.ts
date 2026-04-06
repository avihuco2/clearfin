import { createScraper, CompanyTypes } from 'israeli-bank-scrapers'
import type { ScraperCredentials } from 'israeli-bank-scrapers'
import type { Job } from 'bullmq'
import { decrypt } from '@clearfin/crypto'
import { sql } from '../lib/db.js'
import { redis } from '../lib/redis.js'

async function logCredentialAccess(
  userId: string,
  bankAccountId: string,
  jobId: string,
  triggeredBy: 'manual' | 'schedule',
): Promise<void> {
  try {
    await sql`
      INSERT INTO credential_access_logs (user_id, bank_account_id, action, triggered_by, scrape_job_id)
      VALUES (${userId}, ${bankAccountId}, 'decrypted', ${triggeredBy}, ${jobId})
    `
  } catch (err) {
    console.error('[audit] unexpected error:', err instanceof Error ? err.message : err)
  }
}

// ---------------------------------------------------------------------------
// Job payload and result
// ---------------------------------------------------------------------------

export interface ScrapeJobData {
  userId: string
  bankAccountId: string
  triggeredBy: 'manual' | 'schedule'
}

export interface ScrapeJobResult {
  transactionsAdded: number
}

// ---------------------------------------------------------------------------
// The decrypted credentials stored in the DB are the static fields only
// (e.g. id/password/userCode). The library's credential union also includes
// `otpCodeRetriever` for email-based scrapers — we inject that at runtime.
// ---------------------------------------------------------------------------

type StoredCredentials = Record<string, string>

// ---------------------------------------------------------------------------
// OTP helper
// ---------------------------------------------------------------------------

const OTP_POLL_INTERVAL_MS = 5_000
const OTP_TIMEOUT_MS = 120_000

async function waitForOtp(bankAccountId: string): Promise<string> {
  // Signal the frontend that the scraper needs a one-time password
  await sql`UPDATE bank_accounts SET scrape_status = 'awaiting_otp' WHERE id = ${bankAccountId}`

  return new Promise<string>((resolve, reject) => {
    const deadline = setTimeout(() => {
      clearInterval(poll)
      reject(new Error('OTP_TIMEOUT'))
    }, OTP_TIMEOUT_MS)

    // eslint-disable-next-line prefer-const
    let poll: ReturnType<typeof setInterval>

    poll = setInterval(
      // eslint-disable-next-line @typescript-eslint/no-misused-promises
      async () => {
        const otpKey = `otp:${bankAccountId}`
        const otp = await redis.get<string>(otpKey)
        if (otp !== null) {
          clearTimeout(deadline)
          clearInterval(poll)
          // Delete immediately — OTP is single-use
          await redis.del(otpKey)
          resolve(otp)
        }
      },
      OTP_POLL_INTERVAL_MS,
    )
  })
}

// ---------------------------------------------------------------------------
// Start-date logic
//
// • No existing transactions for this account → always go back 3 months
//   (catches cases where last_scraped_at was set but nothing was saved)
// • Has existing transactions → use last_scraped_at minus 1 day overlap,
//   floored at 3 months ago
// ---------------------------------------------------------------------------

// Extract YYYY-MM-DD in Israeli local time (Asia/Jerusalem = UTC+2/+3).
// txn.date from Max is midnight local time; taking the raw UTC slice loses a day.
function toIsraeliDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('sv', { timeZone: 'Asia/Jerusalem' })
}

function resolveStartDate(lastScrapedAt: string | null, hasTransactions: boolean): Date {
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  if (!lastScrapedAt || !hasTransactions) {
    // No prior data — fetch full 3-month history
    return threeMonthsAgo
  }

  // 1-day overlap avoids gaps caused by timezone or late-posting transactions
  const lastSync = new Date(new Date(lastScrapedAt).getTime() - 24 * 60 * 60 * 1000)
  return lastSync > threeMonthsAgo ? lastSync : threeMonthsAgo
}

// ---------------------------------------------------------------------------
// Main job handler
// ---------------------------------------------------------------------------

export async function processScrapeJob(
  job: Job<ScrapeJobData>,
): Promise<ScrapeJobResult> {
  const { userId, bankAccountId } = job.data

  // ------------------------------------------------------------------
  // 1. Fetch encrypted credentials — always scoped to user_id
  // ------------------------------------------------------------------
  const accounts = await sql`
    SELECT company_id, encrypted_credentials, credentials_iv, credentials_tag, last_scraped_at
    FROM bank_accounts
    WHERE id = ${bankAccountId} AND user_id = ${userId}
  `
  const account = accounts[0]

  if (!account) {
    throw new Error(`bank_account not found: id=${bankAccountId} user=${userId}`)
  }

  // ------------------------------------------------------------------
  // 2. Decrypt credentials — the result must never be logged
  // ------------------------------------------------------------------
  if (!process.env['CREDENTIALS_ENCRYPTION_KEY']) {
    throw new Error('Missing env: CREDENTIALS_ENCRYPTION_KEY')
  }

  const storedCreds = decrypt<StoredCredentials>(
    account.encrypted_credentials as string,
    account.credentials_iv as string,
    account.credentials_tag as string,
    process.env['CREDENTIALS_ENCRYPTION_KEY'],
  )

  // Audit: log every credential decryption — fire-and-forget
  void logCredentialAccess(userId, bankAccountId, String(job.id), job.data.triggeredBy)

  // Inject the OTP retriever function into the credentials object.
  // For scrapers that use email + OTP the type requires otpCodeRetriever;
  // for all others the field is simply ignored.  We cast to ScraperCredentials
  // because the exact shape depends on the bank company and is validated at
  // runtime by the scraper library itself.
  const credentials = {
    ...storedCreds,
    otpCodeRetriever: async () => waitForOtp(bankAccountId),
  } as unknown as ScraperCredentials

  // ------------------------------------------------------------------
  // 3. Mark job + account as running
  // ------------------------------------------------------------------
  await Promise.all([
    sql`UPDATE scrape_jobs SET status = 'running', started_at = NOW() WHERE id = ${String(job.id)}`,
    sql`UPDATE bank_accounts SET scrape_status = 'running' WHERE id = ${bankAccountId}`,
  ])

  // ------------------------------------------------------------------
  // 4. Create and run scraper
  // ------------------------------------------------------------------

  // Check whether this account has any saved transactions yet.
  // If not, we always do a full 3-month backfill even if last_scraped_at is set
  // (last_scraped_at can be set from a scrape that succeeded technically but
  //  saved 0 rows, e.g. due to a now-fixed schema constraint).
  const txnCountRows = await sql`
    SELECT COUNT(*) AS cnt FROM transactions WHERE bank_account_id = ${bankAccountId}
  `
  const hasTransactions = parseInt(txnCountRows[0]?.cnt ?? '0', 10) > 0
  const startDate = resolveStartDate(account.last_scraped_at as string | null, hasTransactions)
  console.log(`[scrape] job=${job.id} startDate=${startDate.toISOString().slice(0, 10)} hasTransactions=${hasTransactions}`)

  const scraper = createScraper({
    companyId: account.company_id as CompanyTypes,
    startDate,
    showBrowser: false,
    verbose: true,
    // Required for Chromium running inside Docker/EC2 containers:
    // --no-sandbox: container runs as non-root without kernel namespaces
    // --disable-dev-shm-usage: /dev/shm is tiny in containers, use /tmp instead
    // --disable-gpu: no GPU in headless server environment
    timeout: 90000,
    executablePath: process.env['PUPPETEER_EXECUTABLE_PATH'] ?? '/usr/bin/chromium',
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-dev-shm-usage',
      '--disable-gpu',
      '--no-first-run',
      '--disable-extensions',
      '--disable-background-networking',
      '--disable-default-apps',
      '--mute-audio',
    ],
  })

  scraper.onProgress((companyId, { type }) => {
    // Safe to log — progress events contain no credentials
    console.log(`[scrape] job=${job.id} company=${companyId} event=${type}`)
  })

  let result
  try {
    result = await scraper.scrape(credentials)
  } catch (scraperErr) {
    const message =
      scraperErr instanceof Error
        ? scraperErr.message
        : 'UNKNOWN_SCRAPER_ERROR'
    await markError(bankAccountId, String(job.id), message)
    throw scraperErr
  }

  if (!result.success) {
    // Save both errorType and errorMessage to the DB for debugging
    const errorDetail = result.errorMessage
      ? `${result.errorType ?? 'GENERIC'}: ${result.errorMessage}`
      : (result.errorType ?? 'SCRAPE_FAILED')
    console.error(`[scrape] job=${job.id} errorType=${result.errorType} errorMessage=${result.errorMessage ?? 'none'}`)
    await markError(bankAccountId, String(job.id), errorDetail)
    throw new Error(errorDetail)
  }

  // ------------------------------------------------------------------
  // 5. Upsert transactions
  // ------------------------------------------------------------------
  let transactionsAdded = 0
  const scraperAccounts = result.accounts ?? []

  console.log(`[scrape] job=${job.id} accounts=${scraperAccounts.length} totalTxns=${scraperAccounts.reduce((s, a) => s + a.txns.length, 0)}`)

  for (const acc of scraperAccounts) {
    console.log(`[scrape] job=${job.id} account=${acc.accountNumber ?? 'unknown'} txns=${acc.txns.length}`)

    // Persist latest balance when available
    if (acc.balance !== undefined) {
      await sql`
        UPDATE bank_accounts
        SET account_number = ${acc.accountNumber ?? null},
            balance = ${acc.balance},
            balance_updated_at = NOW()
        WHERE id = ${bankAccountId}
      `
    }

    if (acc.txns.length === 0) continue

    const rows = acc.txns
      .map((txn) => {
        const chargedAmount = txn.chargedAmount || txn.originalAmount || 0
        const originalAmount = txn.originalAmount || txn.chargedAmount || 0
        // When the bank provides no identifier, generate a stable synthetic one
        // from the fields that uniquely identify the transaction so that
        // re-scraping the same data never creates duplicates.
        const rawId = txn.identifier?.toString() ?? null
        const externalId =
          rawId ??
          `synthetic:${toIsraeliDate(txn.date)}:${txn.description}:${chargedAmount}`
        return {
          user_id: userId,
          bank_account_id: bankAccountId,
          external_id: externalId,
          date: toIsraeliDate(txn.date),
          processed_date: txn.processedDate ? toIsraeliDate(txn.processedDate) : null,
          description: txn.description,
          memo: txn.memo ?? null,
          original_amount: originalAmount,
          original_currency: txn.originalCurrency,
          charged_amount: chargedAmount,
          charged_currency: txn.chargedCurrency ?? 'ILS',
          type: txn.type,
          status: txn.status,
          installment_number: txn.installments?.number ?? null,
          installment_total: txn.installments?.total ?? null,
          sub_account: acc.accountNumber ?? null,
        }
      })
      .filter((row) => row.charged_amount !== 0)

    let batchAdded = 0
    for (const row of rows) {
      try {
        const res = await sql`
          INSERT INTO transactions (
            user_id, bank_account_id, external_id, date, processed_date,
            description, memo, original_amount, original_currency,
            charged_amount, charged_currency, type, status,
            installment_number, installment_total, sub_account
          ) VALUES (
            ${row.user_id}, ${row.bank_account_id}, ${row.external_id},
            ${row.date}, ${row.processed_date},
            ${row.description}, ${row.memo}, ${row.original_amount}, ${row.original_currency},
            ${row.charged_amount}, ${row.charged_currency}, ${row.type}, ${row.status},
            ${row.installment_number}, ${row.installment_total}, ${row.sub_account}
          )
          ON CONFLICT (bank_account_id, external_id) DO NOTHING
        `
        batchAdded += res.count
      } catch (insertErr) {
        console.error(
          `[scrape] insert error bankAccountId=${bankAccountId} externalId=${row.external_id}:`,
          insertErr instanceof Error ? insertErr.message : insertErr,
        )
      }
    }

    console.log(`[scrape] job=${job.id} upsert count=${batchAdded}`)
    transactionsAdded += batchAdded
  }

  // ------------------------------------------------------------------
  // 6. Mark done
  // ------------------------------------------------------------------
  await Promise.all([
    sql`
      UPDATE bank_accounts
      SET scrape_status = 'idle', scrape_error = NULL, last_scraped_at = NOW()
      WHERE id = ${bankAccountId}
    `,
    sql`
      UPDATE scrape_jobs
      SET status = 'done', transactions_added = ${transactionsAdded}, finished_at = NOW()
      WHERE id = ${String(job.id)}
    `,
  ])

  console.log(
    `[scrape] job=${job.id} bankAccountId=${bankAccountId} ` +
    `transactionsAdded=${transactionsAdded}`,
  )

  return { transactionsAdded }
}

// ---------------------------------------------------------------------------
// Error helper — writes error status to both tables atomically
// ---------------------------------------------------------------------------

async function markError(
  bankAccountId: string,
  jobId: string,
  message: string,
): Promise<void> {
  await Promise.all([
    sql`
      UPDATE bank_accounts
      SET scrape_status = 'error', scrape_error = ${message}
      WHERE id = ${bankAccountId}
    `,
    sql`
      UPDATE scrape_jobs
      SET status = 'error', error_message = ${message}, finished_at = NOW()
      WHERE id = ${jobId}
    `,
  ])
}
