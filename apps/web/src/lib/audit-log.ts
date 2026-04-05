import { createAdminClient } from './supabase/server'

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
 * Uses the service-role client so it can bypass RLS.
 * Failures are logged but never thrown — auditing must not break the main flow.
 */
export async function logCredentialAccess(opts: LogOptions): Promise<void> {
  try {
    const supabase = createAdminClient()
    const { error } = await supabase.from('credential_access_logs').insert({
      user_id: opts.userId,
      bank_account_id: opts.bankAccountId,
      action: opts.action,
      triggered_by: opts.triggeredBy ?? null,
      scrape_job_id: opts.scrapeJobId ?? null,
      metadata: opts.metadata ?? null,
    })
    if (error) {
      console.error('[audit] failed to write log:', error.message)
    }
  } catch (err) {
    console.error('[audit] unexpected error:', err)
  }
}
