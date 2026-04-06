import { readdir, readFile } from 'fs/promises'
import { join } from 'path'
import postgres from 'postgres'

const DATABASE_URL = process.env.DATABASE_URL
if (!DATABASE_URL) throw new Error('Missing DATABASE_URL')

const sql = postgres(DATABASE_URL, { max: 1 })

const migrationsDir = join(process.cwd(), 'supabase/migrations')

async function main() {
  // Tracking table — created once, records which migrations have run
  await sql`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      filename   TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `

  const files = (await readdir(migrationsDir))
    .filter(f => f.endsWith('.sql'))
    .sort()

  const applied = await sql<{ filename: string }[]>`
    SELECT filename FROM schema_migrations
  `
  const appliedSet = new Set(applied.map(r => r.filename))

  for (const file of files) {
    if (appliedSet.has(file)) {
      console.log(`Skip (already applied): ${file}`)
      continue
    }

    const content = await readFile(join(migrationsDir, file), 'utf8')
    console.log(`Running migration: ${file}`)
    await sql.unsafe(content)
    await sql`INSERT INTO schema_migrations (filename) VALUES (${file})`
    console.log(`Done: ${file}`)
  }

  await sql.end()
  console.log('All migrations complete')
}

main().catch(err => { console.error(err); process.exit(1) })
