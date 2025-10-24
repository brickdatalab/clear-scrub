# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

ClearScrub is a bank statement underwriting platform for lenders. The system ingests applicant documents (bank statements, loan applications) via API/dashboard/email, uses LlamaIndex + Mistral OCR for extraction, and displays financial analytics in a React dashboard.

**Architecture:** Decoupled frontend (React) + backend (Supabase PostgreSQL + Edge Functions)

**Current Phase:** The full UI has been migrated to shadcn/ui and the API service layer is complete. The platform is ready for the next phase: implementing manual document upload and email ingestion features.

## Essential Commands

### Frontend Development
```bash
cd clearscrub_dashboard

# Deploy to production (NO LOCAL DEV - See "PRODUCTION-ONLY WORKFLOW" at bottom)
vercel --prod
```

### Supabase Edge Functions
```bash
cd supabase

# Deploy specific function
supabase functions deploy <function-name> --project-ref vnhauomvzjucxadrbywg

# Deploy all functions
supabase functions deploy --project-ref vnhauomvzjucxadrbywg

# View function logs
supabase functions logs <function-name> --project-ref vnhauomvzjucxadrbywg
```

### Database Migrations
```bash
cd supabase/database

# Apply migrations to remote database
supabase db push --project-ref vnhauomvzjucxadrbywg

# Create new migration
supabase migration new <migration-name>
```

## System Architecture

### Data Flow: Ingestion → Database → Dashboard

**3 Ingestion Methods (All Routes Lead to Database):**
1.  **API Webhook:** External services POST JSON → Edge Functions
2.  **Manual Upload:** Dashboard drag-and-drop → Supabase Storage → Processing
3.  **Email Ingestion:** `{org_id}@underwrite.cleardata.io` → Attachment processing

**Processing Pipeline:**
```
PDF Upload → Supabase Storage (incoming-documents bucket)
  ↓
LlamaIndex + Mistral OCR Extraction
  ↓
Structured JSON (statements/applications schema)
  ↓
Edge Function Intake Webhook (statement-schema-intake OR application-schema-intake)
  ↓
Entity Resolution (4-step: EIN → normalized_legal_name → aliases → create)
  ↓
Database Tables: companies → accounts → statements → transactions
  ↓
Materialized View Refresh (account_monthly_rollups, company_rollups)
  ↓
Dashboard API (list-companies, get-company-detail, get-statement-transactions)
  ↓
React Dashboard Display
```

### Frontend Structure (`clearscrub_dashboard/src/`)

**UI & Component Stack (as of Oct 23, 2025):**
*   **Component Library:** **shadcn/ui** (The entire legacy UI has been removed).
*   **Data Tables:** **TanStack React Table v8** for all data grids (companies, files, etc.).
*   **Forms:** **React Hook Form + Zod** for robust, schema-based validation.
*   **Typography:** **Geist Sans** self-hosted variable font.
*   **Styling:** **Tailwind CSS** with HSL design tokens.

**Key Files:**
*   `lib/supabaseClient.ts` - Singleton Supabase client, auto-includes JWT from auth state.
*   `services/api.ts` - All backend API calls (getCompanies, getCompanyDetail, etc.).
*   `hooks/useAuth.tsx` - Real Supabase Auth for session management.
*   `pages/Companies.tsx` - Company list with TanStack React Table.
*   `pages/CompanyDetail.tsx` - Full company profile with bank statements.
*   `components/BankSummarySection.tsx` - Lazy-loads transactions on user expand.

**Authentication:**
*   Uses Supabase Auth (JWT tokens).
*   Auth state managed via `useAuth` hook.
*   Row Level Security (RLS) enforced on database for multi-tenancy.
*   **See [Complete Authentication Setup](#complete-authentication-setup) section below for full details.**

**State Management:**
*   React Context API for auth state.
*   TanStack Query for server state (available but not heavily used yet).
*   Local component state for UI interactions.

### Backend Structure (`supabase/`)

**Database Schema (PostgreSQL):**
```
organizations (multi-tenant root)
  ├─ profiles (users)
  ├─ api_keys (API authentication)
  └─ companies (applicants)
       ├─ applications (loan requests)
       ├─ accounts (bank accounts)
       │    └─ statements (monthly periods)
       │         └─ transactions (individual line items)
       ├─ submissions (upload batches)
       │    └─ documents (individual files)
       └─ company_aliases (manual name variations)

Materialized Views:
  - account_monthly_rollups (pre-calculated monthly aggregates)
  - company_rollups (company-level metrics)
```

**Edge Functions (Deno TypeScript):**
*   **Intake Webhooks:** `statement-schema-intake`, `application-schema-intake`
*   **Read APIs:** `list-companies`, `get-company-detail`, `get-statement-transactions`, `get-company-debts`

### Critical Architectural Decisions

1.  **Unified Entity Resolution:** Both intake webhooks use a 4-step matching process (EIN → normalized name → alias → create) to prevent duplicate companies.
2.  **Lazy-Loading Transactions:** The main company detail API excludes transactions to keep payloads small (<50KB). Transactions are fetched on-demand from a separate endpoint.
3.  **Materialized View Refresh via RPC:** Edge Functions call `REFRESH...CONCURRENTLY` via RPC after data ingestion, avoiding trigger limitations within transactions.
4.  **Field Name Mapping Layer:** Edge Functions explicitly map database `snake_case` to frontend `camelCase` to prevent UI errors.
5.  **Three Authentication Contexts:**
    1.  **Webhook Intake:** Shared secret (`X-Webhook-Secret`).
    2.  **Database Writes:** Service Role Key (bypasses RLS).
    3.  **Read APIs:** User JWT (enforces RLS).
6.  **Entity Normalization:** `normalized_legal_name` and `account_number_hash` are used to deduplicate companies and accounts despite variations in source data.

## Key Database Constraints

*   **Performance Indexes:** `ux_statements_account_period`, `ux_companies_org_normalized`, `ux_accounts_number_hash`, `idx_statements_company_period`.
*   **Unique Constraints:** `companies.ein` (per org), `applications.submission_id`, `accounts.account_number_hash`.
*   **RLS Policies:** All tables have RLS enabled, filtering by the user's `org_id`. The Service Role Key used by intake webhooks bypasses RLS for administrative writes.

## Database Migration Versioning

Some early schema changes were applied directly via the SQL console and are not tracked by the Supabase versioning system. **However, the mandatory workflow now is to use migrations for all schema changes.**

**Migration Naming Convention:**
*   Format: `YYYYMMDD_descriptive_name.sql`
*   Stored in: `/supabase/database/migrations/`
*   Applied via: `supabase db push --project-ref vnhauomvzjucxadrbywg`

**Critical Triggers (Do Not Drop):**
*   `on_auth_user_created` on `auth.users` → calls `handle_new_user()` to create an organization, profile, and default API key for new signups. This is essential for multi-tenancy.

## Complete Authentication Setup

### Overview

ClearScrub uses a production-ready Supabase Auth system with automatic organization assignment and multi-tenant security via Row Level Security (RLS).

### Signup Architecture

A database trigger (`on_auth_user_created`) fires upon user creation. The `handle_new_user()` function then atomically:
1.  Creates a new organization.
2.  Creates a user profile linked to that organization.
3.  **Creates a default API key for the new organization.**

This ensures every user is correctly associated with an organization for RLS before their first API call.

### Login Architecture

Login generates a JWT, which is managed by the `useAuth` hook. The Supabase client automatically includes this JWT in all API calls, allowing PostgreSQL to enforce RLS policies by matching the user's `org_id`.

### RLS Policy Enforcement

All data tables are protected by RLS policies that permit access only when the data's `org_id` matches the `org_id` associated with the user's JWT. This is enforced at the database level and cannot be bypassed by the client.

### Protected Routes Pattern

A `ProtectedRoute` component wraps all authenticated routes, checking the `useAuth` state and redirecting to `/login` if the user is not authenticated.

## Environment Configuration

**Frontend (`.env` in `clearscrub_dashboard/`):**
```
VITE_SUPABASE_URL=https://vnhauomvzjucxadrbywg.supabase.co
VITE_SUPABASE_ANON_KEY=<anon_key>
```

**Backend:**
*   Project ID: `vnhauomvzjucxadrbywg`
*   Webhook Secret: `clearscrub_webhook_2025_xyz123`

## Common Troubleshooting

*   **Frontend won't connect:** Check `.env` file in `clearscrub_dashboard/` and restart the dev server (if applicable, though production workflow is standard).
*   **Edge Function deployment fails:** Ensure you are in the `supabase/` directory and the project ref is correct.
*   **Duplicate companies appearing:** Verify unified entity resolution logic in intake webhooks.
*   **Transactions not loading:** Check browser console for API errors and verify JWT is present in request headers. Use `supabase functions logs` to debug.

## Current Development Status

**Completed Milestones (as of October 23, 2025):**
*   ✅ **Full UI Migration to shadcn/ui:** The entire frontend has been rebuilt with shadcn/ui, TanStack Table, and RHF/Zod. This resulted in an 86% bundle size reduction and full WCAG 2.1 AA accessibility compliance. The legacy UI and feature flags have been removed.
*   ✅ **API Service Layer:** A comprehensive service layer (`src/services/api.ts`) with 20+ CRUD functions for managing API Keys, Webhooks, Notifications, and Automation Triggers is complete.
*   ✅ **Enhanced Signup Trigger:** The `handle_new_user` trigger now automatically generates a default API key (`cs_live_{...}`) for every new organization upon signup.
*   ✅ **Production-Ready Authentication:** The auth system is complete with signup, login, RLS on all tables, protected routes, and session management.

**Next Phase:**
*   Implement the manual upload feature (dashboard drag-and-drop).
*   Implement email ingestion (`{org_id}@underwrite.cleardata.io`).
*   Connect the Settings page UI to the new API service layer endpoints.

## Sequential Thinking Requirement

Per Vincent's global instructions, always use sequential thinking (`mcp__sequential-thinking` tool) before responding to messages. This helps:
- Fix bugs methodically
- Plan task execution
- Figure out optimal approaches
- Break down complex problems

Use sequential thinking for bug fixes, task planning, and implementation decisions.
- when assigned tasks by the user, always spawn agents OR use pre-built sub agents for the tasks.
- FYI: You, Claude Code, manage persistent memory using supermemory mcp (via the sub agent memory-agent) and two main file types: `CLAUDE.md` for shared or global project context, 
and `CLAUDE.local.md` for private, developer-specific notes. 

---
**Instructions:**  
If during your session:
* You learned something new about the project
* I corrected you on a specific implementation detail 
* I corrected source code you generated
* You struggled to find specific information and had to infer details about the project
* You lost track of the project structure and had to look up information in the source code
...that is relevant, was not known initially, and should be persisted, add it to the appropriate `CLAUDE.md` (for shared context) or 
`CLAUDE.local.md` (for private notes) file. AND DEF ADD with the sub agent memory-agent. If the information is relevant for a subdirectory only, 
place or update it in the `CLAUDE.md` file within that subdirectory.
When specific information belongs to a particular subcomponent, ensure you place it in the CLAUDE file for that component.
For example:
* Information A belongs exclusively to the `heatsense-ui` component → put it in `clearscrub_main/clearscrub_dashboard/CLAUDE.md`
* Information B belongs exclusively to the `heatsense-api` component → put it in `clearscrub_main/supabase/CLAUDE.md`
* Information C is infrastructure-as-code related → put it in `clearscrub_main/CLAUDE.md`
This ensures important knowledge is retained and available in future sessions.

---

## PRODUCTION-ONLY WORKFLOW (VINCENT'S RULE)

**🔴 CRITICAL: ALL development work goes DIRECTLY to production only. NO local testing. NO staging.**

**Why:** Single developer (Vincent only), sole user, direct production updates preferred.

### Dashboard Changes (Frontend)

**Files Modified:** `/Users/vitolo/Desktop/clearscrub_main/clearscrub_dashboard/src/`

**Deployment:**
1.  Make changes to React/TypeScript files.
2.  From `clearscrub_dashboard/` directory: `vercel --prod`
3.  Wait ~1-2 minutes for Vercel deployment.
4.  Tell Vincent to refresh browser at `https://dashboard.clearscrub.io`.
5.  Changes are live immediately.

**NO `npm run dev` local testing. Changes go straight to production.**

### Database Changes (Backend)

**Files Modified:** `/Users/vitolo/Desktop/clearscrub_main/supabase/database/migrations/`

**Deployment - Option A (Migrations):**
1.  Create new migration: `YYYYMMDD_descriptive_name.sql`.
2.  Write SQL changes in migration file.
3.  From `supabase/database/` directory: `supabase db push --project-ref vnhauomvzjucxadrbywg`
4.  Tell Vincent to refresh dashboard page.
5.  Changes are live immediately.

**Deployment - Option B (Quick Data Changes):**
1.  Use: `mcp__supabase__execute_sql` to run SQL directly on vnhauomvzjucxadrbywg.
2.  Tell Vincent to refresh dashboard.
3.  Changes are live immediately.

**NO local Supabase emulator. Changes go straight to production database.**

### When Making Changes

*   Always specify which deployment command to run.
*   Always tell Vincent to refresh after deployment.
*   Always apply changes directly to production files.
*   Never suggest local testing as an option.

**Status:** ACTIVE - MANDATORY FOR ALL DEVELOPMENT SESSIONS
- any general tasks you are instructed to do on the file system of this computer you will ALWAYS ASSIGN TO THE general SUB AGENT. moving a file, reading, editing, creating, etc...this is an instrucitons file for an ai i use through the cli. from top to bottom is the chronological order of when information was added (meaning the bottom has the most recent information)