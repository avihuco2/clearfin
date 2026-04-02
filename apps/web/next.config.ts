import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@clearfin/crypto'],
  // Required for Node.js runtime in Route Handlers (BullMQ, crypto)
  serverExternalPackages: ['bullmq', '@upstash/redis'],
}

export default nextConfig
