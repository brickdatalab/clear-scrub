---
name: clear-scrub-supabase
description: Supabase skill for the ClearScrub document processing platform. Provides database schema, RLS patterns, Edge Function templates, and React hooks for the clear_scrub project.
---

# ClearScrub Supabase Skill

This skill provides Supabase patterns and reference documentation for the **ClearScrub** project - a document processing platform for lender organizations.

## Quick Reference

| Property | Value |
|----------|-------|
| **Project ID** | `vnhauomvzjucxadrbywg` |
| **Project URL** | https://vnhauomvzjucxadrbywg.supabase.co |
| **Anon Key** | `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuaGF1b212emp1Y3hhZHJieXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODgwMTQsImV4cCI6MjA3NDc2NDAxNH0.02F8onN1U6DgDZYUSdY2EY12RG16jux-uy--lRSKe5c` |
| **Publishable Key** | `sb_publishable_39tvWXFYrdB0nZ2MjHpsFw_p-P42bbQ` |
| **MCP Tools** | `mcp__supabase-vin__*` |

---

## Reference Documentation

- [Schema Reference](./reference/schema.md) - Complete database schema with all tables, columns, and relationships
- [RLS Patterns](./reference/rls-patterns.md) - Row Level Security policy patterns for multi-tenant isolation
- [Edge Functions](./reference/edge-functions.md) - Edge Function templates and deployment patterns
- [React Patterns](./reference/react-patterns.md) - React hooks for authentication, data fetching, and real-time subscriptions

---

## Scripts

- [generate-types.sh](./scripts/generate-types.sh) - Generate TypeScript types from database schema
- [test-rls.sql](./scripts/test-rls.sql) - SQL tests to verify RLS policies

---

## Project Overview

ClearScrub is a multi-tenant document processing platform for lender organizations. It handles:

### Core Features
- **Document Ingestion**: Upload via dashboard, API, or email forwarding
- **Document Classification**: AI-powered classification (bank statements, loan applications)
- **Data Extraction**: Extract structured data from bank statements and applications
- **Transaction Categorization**: Categorize transactions with confidence scoring
- **Submission Analytics**: Aggregated metrics for each submission

### Multi-Tenant Architecture
All data is isolated by organization using RLS policies based on `org_id`.

---

## Database Tables

### Core Entities
| Table | Purpose | RLS |
|-------|---------|-----|
| organizations | Top-level tenant | Enabled |
| profiles | User accounts | Enabled |
| api_keys | API authentication | Enabled |

### Document Processing
| Table | Purpose | RLS |
|-------|---------|-----|
| submissions | Document intake events | Disabled* |
| files | Uploaded documents | Disabled* |
| accounts | Bank accounts | Enabled |
| bank_statements | Statement periods | Enabled |
| transactions | Individual transactions | Enabled |
| applications | Loan application data | Enabled |

### Reference & Analytics
| Table | Purpose | RLS |
|-------|---------|-----|
| categories | Transaction categories | Enabled |
| submission_metrics | Aggregated analytics | Enabled |
| webhooks | Integration configs | Enabled |
| audit_log | Compliance trail | Enabled |

*Handled by Edge Functions with service role

---

## Edge Functions

### Document Processing Pipeline
| Function | Purpose |
|----------|---------|
| classify-document | Classify file type |
| extract-bank-statement | Extract statement data |
| extract-application | Extract loan application data |
| process-document | Orchestrate full pipeline |

### API Endpoints
| Function | Purpose |
|----------|---------|
| list-companies | List submissions for dashboard |
| get-company-detail | Get submission details |
| get-statement-transactions | Get transactions for statement |
| get-company-debts | Get debt analysis |

---

## Usage Examples

### Initialize Supabase Client

```typescript
import { createClient } from '@supabase/supabase-js';
import type { Database } from './database.types';

const supabase = createClient<Database>(
  'https://vnhauomvzjucxadrbywg.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZuaGF1b212emp1Y3hhZHJieXdnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxODgwMTQsImV4cCI6MjA3NDc2NDAxNH0.02F8onN1U6DgDZYUSdY2EY12RG16jux-uy--lRSKe5c'
);
```

### Query with RLS

```typescript
// User's org_id is automatically filtered via RLS
const { data: submissions } = await supabase
  .from('submissions')
  .select('*, files(*)')
  .order('created_at', { ascending: false });
```

### Call Edge Function

```typescript
const { data, error } = await supabase.functions.invoke('list-companies', {
  body: { limit: 10 }
});
```

---

## MCP Tool Reference

Use these tools for ClearScrub database operations:

```
mcp__supabase-vin__list_tables
mcp__supabase-vin__execute_sql
mcp__supabase-vin__apply_migration
mcp__supabase-vin__list_edge_functions
mcp__supabase-vin__deploy_edge_function
mcp__supabase-vin__get_logs
mcp__supabase-vin__get_advisors
mcp__supabase-vin__generate_typescript_types
```

Always use project_id: `vnhauomvzjucxadrbywg`

---

## Migrations History

Recent migrations applied:

| Version | Name |
|---------|------|
| 20251222172754 | phase2_modify_submissions |
| 20251222172843 | phase3_create_files_accounts |
| 20251222172846 | phase3_create_bank_statements_categories |
| 20251222172952 | phase3_create_transactions |
| 20251222173002 | phase3_create_applications_metrics |
| 20251222173154 | phase4_functions_triggers |
| 20251222173200 | phase5_seed_categories |
| 20251222173257 | phase6_rls_policies |
| 20251223150345 | add_insert_rls_policies |
| 20251223150510 | fix_rls_allow_all_inserts |
| 20251223174241 | fix_prepare_submission_rpc |

---

## Security Notes

1. **Never expose service role key** in client-side code
2. **Always use anon key** for frontend applications
3. **RLS is disabled on submissions/files** - handled by Edge Functions with service role
4. **API keys are stored as bcrypt hashes** - plaintext shown only once at creation
5. **Soft delete pattern** used for api_keys (deleted_at column)
