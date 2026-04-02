import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// Lazy-initialised — not created at module load time so Next.js build
// doesn't attempt a Redis connection when env vars are absent.
let _queue: Queue | null = null

function getQueue(): Queue {
  if (!_queue) {
    const connection = new IORedis(process.env.UPSTASH_REDIS_URL!, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      tls: {},
    })
    _queue = new Queue('scrape', { connection })
  }
  return _queue
}

export async function enqueueScrapeJob(
  userId: string,
  bankAccountId: string,
  triggeredBy: 'manual' | 'schedule',
): Promise<string> {
  const job = await getQueue().add(
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
