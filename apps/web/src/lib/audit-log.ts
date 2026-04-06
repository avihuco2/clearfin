import { sql } from '@clearfin/db/client'

export type CredentialAction = 'stored' | 'updated' | 'deleted' | 'decrypted'

interface LogOptions {
  userId: string
  bankAccountId: string
  action: CredentialAction
  triggeredBy?: 'manual' | 'schedule' | 'user'
  scrapeJobId?: string
  metadata?: Record<string, unknown>
}

/**
 * Write a credential access event to credential_access_logs.
 * Uses a direct sql connection so it bypasses RLS (equivalent to service-role).
 * Failures are logged but never thrown — auditing must not break the main flow.
 */
export async function logCredentialAccess(opts: LogOptions): Promise<void> {
  try {
    await sql`
      INSERT INTO credential_access_logs
        (user_id, bank_account_id, action, triggered_by, scrape_job_id, metadata)
      VALUES
        (
          ${opts.userId},
          ${opts.bankAccountId},
          ${opts.action},
          ${opts.triggeredBy ?? null},
          ${opts.scrapeJobId ?? null},
          ${opts.metadata ? JSON.stringify(opts.metadata) : null}
        )
    `
  } catch (err) {
    console.error('[audit] failed to write log:', err)
  }
}
