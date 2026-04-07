import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  transpilePackages: ['@clearfin/crypto'],
  serverExternalPackages: ['@upstash/redis'],
  experimental: {
    nodeMiddleware: true,
  },
}

export default nextConfig
