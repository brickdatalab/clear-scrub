# ClearScrub Supabase - CLAUDE.md

This file provides guidance for backend development on Supabase (database, Edge Functions, migrations).

## Production-Only Workflow (VINCENT'S RULE)

**🔴 ALL database and Edge Function work goes DIRECTLY to production. NO local Supabase emulator.**

### Making Database Changes

**Files Modified:** `database/migrations/` directory

**Change Types:**
- Schema changes (new tables, columns, indexes)
- Trigger/function updates
- Data migrations
- Test data management

**Deployment Process - Option A (Schema Migrations):**

1. Create new migration file: `YYYYMMDD_descriptive_name.sql`
2. Write SQL changes in the migration file (e.g., `database/migrations/20251022_add_new_column.sql`)
3. From `supabase/database/` directory, run: `supabase db push --project-ref vnhauomvzjucxadrbywg`
4. Wait for migration to apply to production database (vnhauomvzjucxadrbywg)
5. Tell Vincent to refresh dashboard at `https://dashboard.clearscrub.io`
6. Changes are live immediately

**Deployment Process - Option B (Quick Data Changes):**

1. Use tool: `mcp__supabase__execute_sql`
2. Run SQL directly on project: vnhauomvzjucxadrbywg
3. Tell Vincent to refresh dashboard page
4. Changes are live immediately

**NO local Supabase emulator. Changes go straight to production database.**

### Database Project Details

- **Project ID:** vnhauomvzjucxadrbywg
- **Location:** Production
- **Access:** Direct via `supabase db push` or MCP tools
- **RLS Enabled:** Yes (multi-tenant via org_id)

### Verification

After database changes:
- Vincent refreshes dashboard page at `https://dashboard.clearscrub.io`
- Check dashboard for updated data
- Verify no errors in browser console or Supabase logs

### Key Directories

- `database/migrations/` - SQL migration files
- `functions/` - Edge Functions (Deno TypeScript)
- `database/CLAUDE.md` - Database-specific documentation

### Deployment Command Reference

```bash
# Deploy database migration to production
cd supabase/database
supabase db push --project-ref vnhauomvzjucxadrbywg

# View database logs
supabase functions logs <function-name> --project-ref vnhauomvzjucxadrbywg
```

### Edge Functions

Edge Functions are deployed separately:

```bash
# Deploy specific Edge Function to production
cd supabase
supabase functions deploy <function-name> --project-ref vnhauomvzjucxadrbywg

# Deploy all Edge Functions
supabase functions deploy --project-ref vnhauomvzjucxadrbywg
```

### Important: Backup & Rollback

Each migration should include a documented rollback procedure in the migration file comments. See `database/migrations/ROLLBACK.md` for reference.

**Status:** ACTIVE - APPLY TO ALL DATABASE/BACKEND WORK
