import { Queue } from 'bullmq'
import IORedis from 'ioredis'

// Lazy-initialised — not created at module load time so Next.js build
// doesn't attempt a Redis connection when env vars are absent.
let _queue: Queue | null = null

function getQueue(): Queue {
  if (!_queue) {
    const url = process.env.UPSTASH_REDIS_URL!
    const useTls = url.startsWith('rediss://')
    const connection = new IORedis(url, {
      maxRetriesPerRequest: null,
      enableReadyCheck: false,
      ...(useTls ? { tls: {} } : {}),
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
