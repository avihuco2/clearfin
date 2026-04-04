import { createScraper, CompanyTypes } from 'israeli-bank-scrapers'
import type { ScraperCredentials } from 'israeli-bank-scrapers'
import type { Job } from 'bullmq'
import { decrypt } from '@clearfin/crypto'
import { supabase } from '../lib/supabase.js'
import { redis } from '../lib/redis.js'

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
  await supabase
    .from('bank_accounts')
    .update({ scrape_status: 'awaiting_otp' })
    .eq('id', bankAccountId)

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
  const { data: account, error: fetchError } = await supabase
    .from('bank_accounts')
    .select(
      'company_id, encrypted_credentials, credentials_iv, credentials_tag, last_scraped_at',
    )
    .eq('id', bankAccountId)
    .eq('user_id', userId)
    .single()

  if (fetchError || !account) {
    throw new Error(
      `bank_account not found: id=${bankAccountId} user=${userId}`,
    )
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
  const startedAt = new Date().toISOString()

  await Promise.all([
    supabase
      .from('scrape_jobs')
      .update({ status: 'running', started_at: startedAt })
      .eq('id', job.id),
    supabase
      .from('bank_accounts')
      .update({ scrape_status: 'running' })
      .eq('id', bankAccountId),
  ])

  // ------------------------------------------------------------------
  // 4. Create and run scraper
  // ------------------------------------------------------------------

  // Check whether this account has any saved transactions yet.
  // If not, we always do a full 3-month backfill even if last_scraped_at is set
  // (last_scraped_at can be set from a scrape that succeeded technically but
  //  saved 0 rows, e.g. due to a now-fixed schema constraint).
  const { count: txnCount } = await supabase
    .from('transactions')
    .select('id', { count: 'exact', head: true })
    .eq('bank_account_id', bankAccountId)

  const hasTransactions = (txnCount ?? 0) > 0
  const startDate = resolveStartDate(account.last_scraped_at as string | null, hasTransactions)
  console.log(`[scrape] job=${job.id} startDate=${startDate.toISOString().slice(0,10)} hasTransactions=${hasTransactions}`)

  const scraper = createScraper({
    companyId: account.company_id as CompanyTypes,
    startDate,
    showBrowser: false,
    verbose: false,
    // Required for Chromium running inside Docker containers:
    // --no-sandbox: container runs as non-root without kernel namespaces
    // --disable-dev-shm-usage: /dev/shm is tiny in containers, use /tmp instead
    // --disable-gpu: no GPU in headless server environment
    puppeteerConfig: {
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
    },
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
    // Log errorMessage for debugging (contains no credentials)
    console.error(`[scrape] job=${job.id} errorType=${result.errorType} errorMessage=${result.errorMessage ?? 'none'}`)
    const errorMessage = result.errorType ?? 'SCRAPE_FAILED'
    await markError(bankAccountId, String(job.id), errorMessage)
    throw new Error(errorMessage)
  }

  // ------------------------------------------------------------------
  // 5. Upsert transactions
  // ------------------------------------------------------------------
  let transactionsAdded = 0
  const accounts = result.accounts ?? []

  console.log(`[scrape] job=${job.id} accounts=${accounts.length} totalTxns=${accounts.reduce((s, a) => s + a.txns.length, 0)}`)

  for (const acc of accounts) {
    console.log(`[scrape] job=${job.id} account=${acc.accountNumber ?? 'unknown'} txns=${acc.txns.length}`)
    // Persist latest balance when available
    if (acc.balance !== undefined) {
      await supabase
        .from('bank_accounts')
        .update({
          account_number: acc.accountNumber ?? null,
          balance: acc.balance,
          balance_updated_at: new Date().toISOString(),
        })
        .eq('id', bankAccountId)
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

    const { count, error: upsertError } = await supabase
      .from('transactions')
      .upsert(rows, {
        onConflict: 'bank_account_id,external_id',
        ignoreDuplicates: true,
        count: 'exact',
      })

    if (upsertError) {
      console.error(`[scrape] upsert error bankAccountId=${bankAccountId}:`, upsertError.message, upsertError.code, upsertError.details)
    }

    console.log(`[scrape] job=${job.id} upsert count=${count} error=${upsertError?.message ?? 'none'}`)
    transactionsAdded += count ?? 0
  }

  // ------------------------------------------------------------------
  // 6. Mark done
  // ------------------------------------------------------------------
  const finishedAt = new Date().toISOString()

  await Promise.all([
    supabase
      .from('bank_accounts')
      .update({
        scrape_status: 'idle',
        scrape_error: null,
        last_scraped_at: finishedAt,
      })
      .eq('id', bankAccountId),
    supabase
      .from('scrape_jobs')
      .update({
        status: 'done',
        transactions_added: transactionsAdded,
        finished_at: finishedAt,
      })
      .eq('id', job.id),
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
    supabase
      .from('bank_accounts')
      .update({ scrape_status: 'error', scrape_error: message })
      .eq('id', bankAccountId),
    supabase
      .from('scrape_jobs')
      .update({
        status: 'error',
        error_message: message,
        finished_at: new Date().toISOString(),
      })
      .eq('id', jobId),
  ])
}
