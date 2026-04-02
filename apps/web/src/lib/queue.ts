import { Queue } from 'bullmq'
import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL!,
  token: process.env.UPSTASH_REDIS_REST_TOKEN!,
})

export const scrapeQueue = new Queue('scrape', { connection: redis as never })

export async function enqueueScrapeJob(
  userId: string,
  bankAccountId: string,
  triggeredBy: 'manual' | 'schedule',
): Promise<string> {
  const job = await scrapeQueue.add(
    'scrape',
    { userId, bankAccountId, triggeredBy },
    {
      attempts: 3,
      backoff: { type: 'exponential', delay: 5000 },
      removeOnComplete: 100,
      removeOnFail: 50,
    },
  )
  return job.id!
}
