import { Redis as UpstashRedis } from '@upstash/redis'
import { Redis as IORedis } from 'ioredis'

if (!process.env['UPSTASH_REDIS_REST_URL']) throw new Error('Missing env: UPSTASH_REDIS_REST_URL')
if (!process.env['UPSTASH_REDIS_REST_TOKEN']) throw new Error('Missing env: UPSTASH_REDIS_REST_TOKEN')
if (!process.env['UPSTASH_REDIS_URL']) throw new Error('Missing env: UPSTASH_REDIS_URL')

/**
 * REST-based Upstash Redis client.
 * Used for OTP key operations (get/del on `otp:{bankAccountId}`).
 * NOT compatible with BullMQ which requires an ioredis-protocol connection.
 */
export const redis = new UpstashRedis({
  url: process.env['UPSTASH_REDIS_REST_URL'],
  token: process.env['UPSTASH_REDIS_REST_TOKEN'],
})

/**
 * ioredis connection used exclusively by BullMQ.
 * Connects to Upstash via the `rediss://` URL (TLS, ioredis protocol).
 * Set UPSTASH_REDIS_URL to:  rediss://default:<token>@<host>:<port>
 */
export const bullConnection = new IORedis(process.env['UPSTASH_REDIS_URL'], {
  maxRetriesPerRequest: null, // required by BullMQ
  enableReadyCheck: false,    // required by BullMQ
  tls: {},                    // Upstash requires TLS
})
