import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@clearfin/crypto'],
  experimental: {
    // Required for Node.js runtime in Route Handlers (BullMQ, crypto)
    serverComponentsExternalPackages: ['bullmq', '@upstash/redis'],
  },
}

export default nextConfig
