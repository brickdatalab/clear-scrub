# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**ClearScrub** is a multi-tenant SaaS platform for bank statement underwriting. It ingests PDFs via dashboard/API/email, classifies documents using AI, extracts structured financial data, and provides analytics through a React dashboard. Competes with Heron Data in the MCA (Merchant Cash Advance) lending space.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | React 18 + Vite + TypeScript |
| UI | shadcn/ui (Radix primitives) + Tailwind CSS |
| Tables | TanStack React Table |
| Forms | React Hook Form + Zod |
| Backend | Supabase Edge Functions (Deno) |
| Database | PostgreSQL with RLS |
| Storage | Supabase Storage (`documents` bucket) |
| Auth | Supabase Auth (JWT) |
| Workflows | n8n (flow.clearscrub.io) |
| Extraction | Gemini 2.5 Flash + Mistral OCR |

## Commands

### Dashboard (clearscrub_dashboard/)

```bash
npm run dev          # Start dev server (port 3000)
npm run build        # TypeScript check + production build
npm run lint         # ESLint (strict, max-warnings 0)
npm run preview      # Preview production build
```

### Edge Functions

```bash
supabase functions deploy --project-ref vnhauomvzjucxadrbywg
supabase functions logs <function-name>  # View logs
```

### TypeScript Types from DB

```bash
# From .claude/skills/clear-scrub-supabase/scripts/
./generate-types.sh
```

## Project Structure

```
clearscrub/
├── clearscrub_dashboard/     # React frontend
│   ├── src/
│   │   ├── components/       # UI components (shadcn/ui in ui/)
│   │   ├── pages/            # Route pages (21 pages)
│   │   ├── services/         # API layer (api.ts, ingestion.ts)
│   │   ├── hooks/            # useAuth, useCompanySubscription, etc.
│   │   ├── lib/              # supabaseClient.ts, utils.ts
│   │   └── layouts/          # AppShell, AppSidebar
│   └── vite.config.ts        # Code splitting config
├── supabase/
│   ├── functions/            # 12 Edge Functions (Deno)
│   └── database/             # Migrations, extraction schemas
└── migration/                # Schema docs, SQL scripts
```

## Database Schema Gotchas

- **Use `files` table, NOT `documents`** — old docs are outdated
- **Storage bucket is `documents`** (not `incoming-documents`)
- Files status flow: `uploaded → classifying → classified → processing → processed/failed`
- Transaction amounts: positive = credit, negative = debit
- **RLS disabled on `submissions` and `files`** — handled by Edge Functions with service role

## Key Architecture Patterns

### Authentication Flow
1. Supabase Auth issues JWT on login
2. `useAuth` hook fetches `org_id` from `profiles` table (not in JWT)
3. `org_id` cached in localStorage for fast reload
4. `authReady` flag prevents API calls before org_id hydrates

### Document Processing Pipeline
```
Upload → Classification (n8n/Gemini) → Extraction → Post-Processing
  ↓           ↓                          ↓             ↓
 files    classification_type      bank_statements   submission_metrics
          status='classified'      transactions
                                   applications
```

### API Service Pattern (services/api.ts)
```typescript
invokeWithAuth<T>(functionName, body)  // Generic Edge Function wrapper
```
All calls use timeout wrappers (30s Supabase, 60s Edge Functions, 120s uploads).

### Code Splitting (vite.config.ts)
Vendor chunks: react, supabase, radix-core, radix-forms, radix-layout, tanstack, forms, icons

## Edge Functions Reference

| Function | Purpose |
|----------|---------|
| `list-companies` | Company list for dashboard |
| `get-company-detail` | Single company with statements/accounts |
| `get-statement-transactions` | Transaction viewer |
| `upload-documents` | Manual upload orchestration |
| `enqueue-document-processing` | Trigger processing pipeline |

## Supabase Project

| Property | Value |
|----------|-------|
| Project ID | `vnhauomvzjucxadrbywg` |
| Dashboard | https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg |
| n8n Workflows | https://flow.clearscrub.io |

## MCP Tools

Use `mcp__supabase-vin__*` tools with project_id `vnhauomvzjucxadrbywg`:
- `list_tables`, `execute_sql`, `apply_migration`
- `list_edge_functions`, `deploy_edge_function`, `get_logs`
- `get_advisors` (security/performance checks)

## Skills

The `.claude/skills/clear-scrub-supabase/` directory contains:
- `reference/schema.md` — Complete database schema
- `reference/rls-patterns.md` — RLS policy patterns
- `reference/edge-functions.md` — Edge Function templates
- `reference/react-patterns.md` — React hooks for Supabase

## Multi-Tenant Architecture

All data isolated by `org_id`. RLS policies enforce:
```sql
org_id IN (SELECT org_id FROM profiles WHERE id = auth.uid())
```

Service role bypasses RLS for Edge Functions:
```sql
(auth.jwt() ->> 'role') = 'service_role'
```

## Key Business Logic

**True Revenue** = Total deposits MINUS non-revenue items (transfers, loan proceeds, reversals)

**Reconciliation Check**: `start_balance + total_credits - total_debits ≈ end_balance`

**Analytics Groups**: revenue, cogs, opex, debt, equity, intra_company, tax, special_items (40 categories)
