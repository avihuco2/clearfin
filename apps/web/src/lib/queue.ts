import { Redis } from '@upstash/redis'

// Use the Upstash REST client for enqueueing — works reliably in Vercel
// serverless without persistent TCP connections.
function getRedis() {
  return new Redis({
    url: process.env.UPSTASH_REDIS_REST_URL!,
    token: process.env.UPSTASH_REDIS_REST_TOKEN!,
  })
}

const QUEUE_KEY = 'scrape:pending'

/**
 * Push a scrape job into the Redis list. The worker pops from this list.
 * Falls back silently if Redis is unavailable — the worker also polls
 * the scrape_jobs Supabase table as a secondary mechanism.
 */
export async function enqueueScrapeJob(
  userId: string,
  bankAccountId: string,
  triggeredBy: 'manual' | 'schedule',
): Promise<void> {
  try {
    await getRedis().lpush(QUEUE_KEY, JSON.stringify({ userId, bankAccountId, triggeredBy }))
  } catch (err) {
    // Non-fatal — worker falls back to polling scrape_jobs table
    console.warn('[queue] Redis enqueue failed, worker will poll DB:', err instanceof Error ? err.message : err)
  }
}
