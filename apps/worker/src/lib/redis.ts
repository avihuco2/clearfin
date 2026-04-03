import { Redis } from '@upstash/redis'

if (!process.env['UPSTASH_REDIS_REST_URL'])   throw new Error('Missing env: UPSTASH_REDIS_REST_URL')
if (!process.env['UPSTASH_REDIS_REST_TOKEN']) throw new Error('Missing env: UPSTASH_REDIS_REST_TOKEN')

/**
 * REST-based Upstash Redis client.
 * Used for OTP key operations (get/del on `otp:{bankAccountId}`).
 */
export const redis = new Redis({
  url:   process.env['UPSTASH_REDIS_REST_URL'],
  token: process.env['UPSTASH_REDIS_REST_TOKEN'],
})
