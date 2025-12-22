# AGENTS.md

This file guides AI/code assistants working on the ClearScrub repository.

## Project Snapshot
- ClearScrub: bank-statement underwriting for lenders; ingest PDFs → Mistral OCR/LlamaIndex → structured JSON → Supabase → React/Vite dashboard.
- Architecture: React frontend (`clearscrub_dashboard/`), Supabase backend (DB + Edge Functions in `supabase/functions/`), migrations in `supabase/database/`, automation in `n8n/`, docs in `docs/`.
- Current context: production-focused workflow; see `plan.md` for any active fix plan (e.g., layout/toolbar updates, upload dialog).

## Workflows & Commands
- Production-first: typical flow is edit → deploy directly to prod. Frontend deploy: `cd clearscrub_dashboard && vercel --prod`. Backend functions: `cd supabase && supabase functions deploy --project-ref vnhauomvzjucxadrbywg`. DB migrations: `cd supabase/database && supabase db push --project-ref vnhauomvzjucxadrbywg`.
- Frontend basics: `npm run build`, `npm run lint`, `npm run preview` (Vite). Dev server available via `npm run dev` if you must inspect locally.
- Testing hooks: Playwright is installed but opt-in; place specs in `clearscrub_dashboard/tests/`. Backend integration script: `npm run test:upload` (root) using `.env.test`.
- n8n automations live in `n8n/`; storage bucket for uploads is typically `documents` (see ingestion function docs).

## Frontend Notes (clearscrub_dashboard/)
- Stack: React 18 + Vite + TypeScript, shadcn/ui, Tailwind, TanStack Query, React Context, React Hook Form + Zod, Lucide icons.
- Key files: `src/lib/supabaseClient.ts`, `src/services/api.ts` (20+ CRUD functions), `src/hooks/useAuth.tsx`, `src/pages/Companies.tsx`, `src/pages/CompanyDetail.tsx`, `src/components/BankSummarySection.tsx`.
- Styling: 2-space TS, PascalCase components, camelCase hooks/utils, group Tailwind utilities (layout before tokens). Use absolute imports `@/` where configured.
- UX perf: transactions lazy-load via `api.getStatementTransactions()` to keep company detail light.

## Backend Notes (supabase/)
- Supabase project ref: `vnhauomvzjucxadrbywg`; production URL `https://dashboard.clearscrub.io`.
- Functions (Deno TS) of note: `statement-schema-intake`, `application-schema-intake`, `list-companies`, `get-company-detail`, `get-statement-transactions`, `get-company-debts`, `upload-documents`, `enqueue-document-processing`, `check-trigger-status`. Each function has its own dir with `index.ts`.
- Entity resolution: 4-step match (EIN → normalized legal name → aliases → create) used in intake functions to prevent duplicate companies.
- Data normalization: snake_case in DB, camelCase in responses; explicit mapping in Edge Functions.
- Materialized views refreshed via RPC after commits (`refresh_account_rollups_concurrent`, `refresh_company_rollups_concurrent`); not in triggers.
- RLS: enabled on all tables; read APIs require JWT; webhooks use shared secret `X-Webhook-Secret: clearscrub_webhook_2025_xyz123`; service role key bypasses RLS for admin writes.
- Critical triggers: `on_auth_user_created` (creates org, profile, default API key). Do not drop.

## Database & Migrations
- Naming: `YYYYMMDD_descriptive_name.sql` in `supabase/database/migrations/`; apply with `supabase db push --project-ref vnhauomvzjucxadrbywg`.
- Notable migrations: `20251016_bank_statement_integration_phase1.sql` (statement schema, mat views), `20251021_create_auth_trigger.sql`, `20251022_update_signup_trigger_add_default_api_key.sql`.
- Constraints/indexes: `ux_statements_account_period`, `ux_companies_org_normalized`, `ux_accounts_number_hash`, `idx_statements_company_period`; unique EIN per org; hashed account numbers unique.

## Testing & Verification
- Frontend: rely on lint/build; Playwright optional (`npx playwright test` in `clearscrub_dashboard`). Show skeleton loaders during fetches.
- Backend: curl against deployed functions (JWT or webhook secret); RLS must scope by `org_id`. Integration script `npm run test:upload`.
- If you must verify locally, use minimal runs (`npm run lint` / `npm run build`) before claiming success.

## Security & Environment
- Never commit secrets (`.env`, service role keys, webhook secrets). Frontend `.env` needs `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`.
- Auth contexts: webhook intake (shared secret), admin writes (service role), user reads (JWT + RLS). Preserve auth headers in any new endpoints.
- Data hygiene: normalize company names and hash account numbers; use `company_aliases` for manual overrides.

## Contribution Practices
- Read files before editing; keep existing conventions. Indentation 2 spaces TS/TSX.
- Commit messages imperative, <72 chars. PRs/hand-off notes: problem, change bullets, screenshots for UI, links to tickets. Run `npm run lint` and `npm run build` (and required Supabase commands) before requesting review or declaring done.
- Documentation references: `docs/ARCHITECTURAL_DECISIONS.md`, `docs/API_CONTRACTS.md`, `docs/AUTHENTICATION_FLOWS.md`, `docs/ORG_ID_ASSIGNMENT.md`, `docs/RLS_POLICY_REFERENCE.md`, ADRs in `docs/ADRs/`, `INTENDED_USER_JOURNEY.md`.
