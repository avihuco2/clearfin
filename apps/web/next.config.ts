import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: ['@clearfin/crypto'],
  serverExternalPackages: ['@upstash/redis'],
}

export default nextConfig
