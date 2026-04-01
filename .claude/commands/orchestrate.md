# Orchestrate

Coordinate a multi-component ClearFin task end-to-end by delegating to specialist agents.

## Usage

```
/orchestrate <task description>
```

## What This Skill Does

1. **Analyzes** the task to identify which layers are affected (frontend / backend / database / scraper-worker / security)
2. **Builds a dependency graph** — determines which agents must run before others
3. **Delegates** to each specialist agent with a precise brief and the interface contract they must satisfy
4. **Integrates** outputs — verifies type contracts, RTL correctness, RLS alignment
5. **Triggers the security agent** if the task touches auth, crypto, or DB schema
6. **Reports** a summary of what was built and any open items

## Agent Routing

| Task type | Agents invoked |
|---|---|
| New UI page/component | `frontend` |
| New API endpoint | `backend` → `frontend` |
| DB schema change | `database` → `backend` → `frontend` |
| New bank/scraper support | `database` + `scraper-worker` → `backend` → `frontend` |
| Auth or credential change | `database` + `backend` → `security` |
| Full feature end-to-end | `database` → `backend` + `scraper-worker` → `frontend` → `security` |
| Security review / pre-deploy | `security` only |

## Constraints Enforced Across All Agents

- RTL: Tailwind logical properties only (`ms-`, `me-`, `ps-`, `pe-`) — never `ml-`, `mr-`
- RLS: every new table gets `enable row level security` + `auth.uid() = user_id` policy
- Secrets: `SUPABASE_SERVICE_ROLE_KEY` and `CREDENTIALS_ENCRYPTION_KEY` never reach the client
- TypeScript strict mode — no untyped `any`
- Node.js 22+ in the worker Dockerfile

## Blocking Rules

- Security agent CRITICAL findings block all deployment steps
- Architectural decisions with significant trade-offs are surfaced to the user for confirmation before proceeding
