# Security Scan

Run a full vulnerability audit of ClearFin using the security agent.

## Usage

```
/security-scan
```

## What This Skill Does

Invokes the `security` agent (`.claude/agents/security.md`) to scan the entire codebase for:

1. **Credential & secret leaks** — hardcoded keys, `SUPABASE_SERVICE_ROLE_KEY` in client code
2. **Cryptography issues** — AES-256-GCM IV reuse, wrong key length, missing auth tag verification
3. **RLS bypass risks** — tables without RLS, `using (true)` policies, service role key on client
4. **SQL injection** — raw SQL string interpolation with user input
5. **API route security** — missing session validation, missing ownership checks
6. **XSS** — `dangerouslySetInnerHTML`, unvalidated Realtime payloads rendered as HTML
7. **Dependency CVEs** — `npm audit` across all packages
8. **Puppeteer/worker security** — credential logging, root user in container, exposed HTTP server
9. **Environment & deployment** — `NEXT_PUBLIC_*` secrets, Vercel config leaks
10. **Authentication flow** — OAuth redirect URI wildcards, insecure session cookies

## Output

A structured report with findings grouped by severity:

- **CRITICAL** — blocks deployment, must fix immediately
- **HIGH** — fix within current sprint
- **MEDIUM** — fix in next sprint
- **LOW / INFORMATIONAL** — recommendations
- **PASSED CHECKS** — confirmed secure areas
- **DEPENDENCY AUDIT** — npm audit summary

## When to Run

- Before every production deployment
- On any PR touching: auth, crypto (`packages/crypto`), database migrations, API routes
- After adding a new npm dependency
- After any change to environment variable usage
