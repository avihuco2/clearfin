import postgres from 'postgres'

if (!process.env['DATABASE_URL']) throw new Error('Missing env: DATABASE_URL')

/**
 * postgres.js SQL client — direct connection to local PostgreSQL.
 * Max 5 connections; idle connections released after 20 s.
 * Used by the worker process only — never imported by browser-side code.
 */
export const sql = postgres(process.env['DATABASE_URL'], {
  max: 5,
  idle_timeout: 20,
  connect_timeout: 10,
})
