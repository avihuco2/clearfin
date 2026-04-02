# Tenant

Manage tenant onboarding, members, and admin configuration for ClearFin.

## Usage

```
/tenant <subcommand> [options]
```

## Subcommands

### `/tenant create`
Scaffold the full tenant onboarding flow end-to-end:
1. `database` agent — verify `tenants`, `tenant_memberships`, `tenant_invitations` tables exist
2. `backend` agent — implement `POST /api/tenants` and redirect logic
3. `frontend` agent — build `/onboarding` wizard page (Hebrew, RTL)
4. `security` agent — audit new tenant creation routes

### `/tenant members`
Build or update the member management UI and API:
1. `backend` agent — implement member list, invite, role change, remove endpoints
2. `frontend` agent — build `/[tenantSlug]/admin/members` page with invite flow
3. Enforce last-admin guard on role-change and remove routes

### `/tenant invite`
Build the invitation flow end-to-end:
1. `backend` agent — `POST /api/tenants/[id]/invitations` (sends token), `POST /api/invitations/[token]/accept`
2. `frontend` agent — build `/invite/[token]` accept page (works pre-login: redirects to Google OAuth then auto-accepts)
3. Token expiry: 7 days, single-use

### `/tenant admin-panel`
Build the admin panel for managing banks, credit cards, and scraping:
1. `frontend` agent — build `/[tenantSlug]/admin/accounts` and `/[tenantSlug]/admin/accounts/new`
2. Credential form renders dynamic fields based on selected `CompanyTypes`
3. Scrape trigger button with real-time job status via Supabase Realtime
4. OTP modal shown automatically when `scrape_status = 'awaiting_otp'`

---

## Tenant Data Model (Summary)

```
tenants
  └── tenant_memberships (user_id, role: admin|viewer)
  └── tenant_invitations (email, token, expires_at)
  └── bank_accounts      (admin-managed, encrypted credentials)
  └── transactions       (all members can view)
  └── categories         (system + tenant-custom)
  └── scrape_jobs        (admin-triggered, all members can read status)
```

## Role Capabilities

| Capability | Admin | Viewer |
|---|---|---|
| View dashboard & transactions | ✅ | ✅ |
| Edit transaction notes/category | ✅ | ✅ |
| Add/remove bank accounts | ✅ | ❌ |
| Trigger manual scrape | ✅ | ❌ |
| Submit OTP during 2FA | ✅ | ❌ |
| Invite / remove members | ✅ | ❌ |
| Change member roles | ✅ | ❌ |
| Create custom categories | ✅ | ❌ |
| Update tenant settings | ✅ | ❌ |
| Delete tenant | ✅ | ❌ |

## Security Constraints

- Admin-only pages must check role server-side in layout — not just in the component
- `<AdminOnly>` wrapper hides UI elements from viewers
- Last admin cannot be demoted or removed (enforced in API + UI)
- Invitations expire after 7 days and are single-use
- Invitation tokens are 32-byte random hex — never sequential or guessable
