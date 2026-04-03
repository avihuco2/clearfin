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
// • No prior scrape → go back 6 months (initial history load)
// • Has prior scrape → go back to last_scraped_at OR 30 days ago,
//   whichever is more recent (avoids re-fetching too much history)
// ---------------------------------------------------------------------------

function resolveStartDate(lastScrapedAt: string | null): Date {
  const threeMonthsAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)

  if (!lastScrapedAt) {
    // First scrape — fetch 3 months of history
    return threeMonthsAgo
  }

  const lastSync = new Date(lastScrapedAt)
  // Use the more recent of: last sync date vs 3 months ago
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
  const scraper = createScraper({
    companyId: account.company_id as CompanyTypes,
    startDate: resolveStartDate(account.last_scraped_at as string | null),
    showBrowser: false,
    verbose: false,
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
    const errorMessage = result.errorType ?? 'SCRAPE_FAILED'
    await markError(bankAccountId, String(job.id), errorMessage)
    throw new Error(errorMessage)
  }

  // ------------------------------------------------------------------
  // 5. Upsert transactions
  // ------------------------------------------------------------------
  let transactionsAdded = 0
  const accounts = result.accounts ?? []

  for (const acc of accounts) {
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

    const rows = acc.txns.map((txn) => ({
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

    const { count, error: upsertError } = await supabase
      .from('transactions')
      .upsert(rows, {
        onConflict: 'bank_account_id,external_id',
        ignoreDuplicates: true,
        count: 'exact',
      })

    if (upsertError) {
      // Log account id only — never log transaction content
      console.error(
        `[scrape] upsert error bankAccountId=${bankAccountId}:`,
        upsertError.message,
      )
    }

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
