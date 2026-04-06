import { build } from 'esbuild'
import { readFileSync } from 'fs'

const pkg = JSON.parse(readFileSync('./package.json', 'utf8'))

// External packages that should NOT be bundled:
// - puppeteer / playwright require native binaries loaded at runtime
// - israeli-bank-scrapers uses puppeteer internally
// - node-cron, bullmq are fine to bundle but keep external for cleaner debugging
const external = [
  'puppeteer',
  'puppeteer-core',
  'israeli-bank-scrapers',
  ...Object.keys(pkg.dependencies ?? {}).filter(d => d !== '@clearfin/crypto'),
]

await build({
  entryPoints: ['src/index.ts'],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: 'bundle/index.mjs',
  external,
  // Resolve workspace package directly from source
  alias: {
    '@clearfin/crypto': '../../packages/crypto/src/index.ts',
  },
  loader: { '.ts': 'ts' },
})

console.log('Worker bundle written to bundle/index.mjs')
