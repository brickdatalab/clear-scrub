# ClearScrub Architectural Decisions
**Date:** October 16, 2025
**Status:** BINDING DECISIONS - Implement As-Is
**Decision Authority:** System Architect

---

## Executive Summary

This document provides binding architectural decisions for the ClearScrub data flow from JSON extraction → Database → React Components. These decisions are based on analysis of:
1. Example JSON output (`example_json_output_*.json`)
2. Complete database schema (`database-schema-complete.md`)
3. Complete component architecture (`COMPONENT_ARCHITECTURE_COMPLETE.md`)

**Key Decision:** The existing database schema is **correct** and requires **zero changes**. We need to build the **API integration layer** only.

---

## 1. DATA FLOW DIAGRAM

```
┌─────────────────────────────────────────────────────────────────────┐
│                         EXTRACTION PHASE                             │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    Flow.io + LlamaIndex Document Processing
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  JSON OUTPUT (Flat Structure)                                       │
│  {                                                                   │
│    summary: {company, account, totals, ...},                       │
│    transactions: [40 items in flat array]                          │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    POST /api/statements/upload (Edge Function)
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                      DATABASE LAYER (Supabase)                       │
│                                                                       │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ statements table                                              │  │
│  │ - id, application_id, bank_name, account_number              │  │
│  │ - raw_transactions (JSONB) ← stores flat transaction array   │  │
│  │ - start_balance, end_balance, total_credits, total_debits    │  │
│  └──────────────────────────────────────────────────────────────┘  │
│                                  │                                   │
│                    Database Trigger on INSERT                       │
│                                  │                                   │
│                                  ▼                                   │
│  ┌──────────────────────────────────────────────────────────────┐  │
│  │ account_monthly_rollups (Materialized View)                  │  │
│  │ - Groups by: organization_id, month, account_number         │  │
│  │ - Aggregates: total_credits, total_debits, transaction_count│  │
│  │ - Pre-calculated for fast dashboard queries                  │  │
│  └──────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    GET /api/applications/:id/details
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│  API RESPONSE (3-Level Nested Structure)                            │
│  {                                                                   │
│    business_info: {...},                                            │
│    monthly_data: {                                                  │
│      "2024-10": {                                                   │
│        accounts: [                                                  │
│          {                                                          │
│            account_number: "3618057067",                           │
│            transactions: [40 items],                               │
│            totals: {credits, debits, ...}                          │
│          }                                                          │
│        ]                                                            │
│      }                                                              │
│    }                                                                │
│  }                                                                   │
└─────────────────────────────────────────────────────────────────────┘
                                  │
                    React Component (CompanyDetail.tsx)
                                  │
                                  ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    DISPLAY LAYER (React UI)                          │
│                                                                       │
│  CompanyDetail.tsx (Orchestrator)                                   │
│    ├─ CompanyHeader.tsx (business info)                            │
│    ├─ MonthlyActivityChart.tsx (visualizes monthly_data)           │
│    ├─ AccountList.tsx (shows accounts per month)                   │
│    └─ TransactionList.tsx (shows individual transactions)          │
│                                                                       │
│  **NO BUSINESS LOGIC** - Components only display + format           │
└─────────────────────────────────────────────────────────────────────┘
```

---

## 2. ARCHITECTURAL DECISIONS (The 5 Questions)

### Decision 1: Transaction Storage Strategy
**CHOSEN: Option A - JSONB Storage**

**Rationale:**
- Components only need to **display** transactions, not search/filter them individually
- Bank statement transactions are **immutable** once imported
- Preserves original JSON structure for audit trail
- The materialized view pattern already handles all required aggregates
- Normalization can be added later if query patterns demand it (YAGNI principle)

**Implementation:**
- Store complete transaction array in `statements.raw_transactions` JSONB field
- Use GIN index on JSONB for any future query needs
- No separate transactions table at this time

**Database Changes Required:** ✅ **NONE** - Schema already supports this

---

### Decision 2: Aggregate Calculation Location
**CHOSEN: Option A - Pre-Calculate at Insert + Materialized Views**

**Rationale:**
- JSON extraction already includes pre-calculated summary metrics
- Bank statements don't change after import (immutable data)
- Components expect instant load times (<2s requirement)
- The `account_monthly_rollups` materialized view is already in the schema
- Server-side calculation eliminates client-side business logic

**Implementation:**
- Edge Function stores summary fields directly in statements table on INSERT
- Database trigger refreshes `account_monthly_rollups` materialized view
- API endpoints query materialized view for aggregates, not raw JSONB

**Database Changes Required:** ✅ **NONE** - Schema already has materialized view

---

### Decision 3: API Response Structure
**CHOSEN: Option A - Nested JSON (3-Level Hierarchy)**

**Rationale:**
- Components are designed for **zero business logic** - they expect pre-structured data
- CompanyDetail.tsx mock data shows exact structure: `monthly_data → accounts → transactions`
- One API call per page load is acceptable (<2s performance target achievable)
- Server-side grouping is cheap; client-side grouping violates "dumb component" principle
- TypeScript interfaces from mock data become API contracts

**Implementation:**
```typescript
// API Response Structure
interface CompanyDetailResponse {
  business_info: {
    id: string;
    name: string;
    status: string;
    // ... other business fields
  };
  monthly_data: {
    [month: string]: {  // e.g., "2024-10"
      accounts: {
        account_number: string;
        bank_name: string;
        transactions: Transaction[];
        totals: {
          credits: number;
          debits: number;
          net: number;
        };
      }[];
    };
  };
}
```

**Database Changes Required:** ✅ **NONE** - API layer does the transformation

---

### Decision 4: Entity Resolution Strategy
**CHOSEN: Option B - Manual Matching with UI**

**Rationale:**
- This is **financial data** - accuracy > speed
- Volume is low (B2B partners, not consumer scale)
- Fuzzy matching algorithms are complex and error-prone
- Manual matching UI is simpler to build correctly
- Can add automatic matching later when patterns emerge from historical data

**Implementation:**
- When new statement JSON arrives, check for existing `businesses` by exact name match
- If no match, present UI showing:
  - New company name from JSON
  - Suggested existing matches (simple ILIKE search)
  - "Create New Business" button
  - "Link to Existing" dropdown
- Store mapping in `applications` table linking `business_id` to statements

**Database Changes Required:** ✅ **NONE** - Schema supports this workflow

---

### Decision 5: Component Data Loading Pattern
**CHOSEN: Option A - Upfront Load with Pagination**

**Rationale:**
- Financial users expect to see the **complete picture** immediately
- The mock data in CompanyDetail.tsx loads everything upfront
- Performance target (<2s) is achievable with proper indexing + materialized views
- Pagination handles scale better than lazy loading complex state
- Keep component logic simple (no complex lazy loading state machines)

**Implementation:**
- CompanyDetail page: Single API call loads all data on mount
- Pagination: 50 statements per page (applied server-side)
- Loading state: Show skeleton loaders during initial fetch
- No incremental loading, no infinite scroll, no complex state

**Database Changes Required:** ✅ **NONE** - Standard LIMIT/OFFSET pagination

---

## 3. API ENDPOINT SPECIFICATIONS

### 3.1 GET /api/applications
**Purpose:** List view for Companies page
**Authentication:** Required (JWT from Supabase Auth)
**RLS:** Filter by user's organization_id

**Request:**
```typescript
GET /api/applications?page=1&limit=50&status=active
```

**Response:**
```typescript
{
  data: [
    {
      id: "uuid",
      business_name: "H2 Build, INC.",
      status: "active",
      created_at: "2024-10-01T...",
      statement_count: 12,
      total_debt_detected: 125000.00,
      last_statement_date: "2024-09-30"
    }
  ],
  pagination: {
    page: 1,
    limit: 50,
    total: 234
  }
}
```

**Database Query:**
```sql
SELECT
  a.id,
  b.name as business_name,
  a.status,
  a.created_at,
  COUNT(s.id) as statement_count,
  COALESCE(SUM(d.current_balance), 0) as total_debt_detected,
  MAX(s.statement_date) as last_statement_date
FROM applications a
JOIN businesses b ON a.business_id = b.id
LEFT JOIN statements s ON s.application_id = a.id
LEFT JOIN debts d ON d.application_id = a.id
WHERE a.organization_id = $1
GROUP BY a.id, b.name, a.status, a.created_at
ORDER BY a.created_at DESC
LIMIT $2 OFFSET $3;
```

---

### 3.2 GET /api/applications/:id/details
**Purpose:** Full company detail view
**Authentication:** Required (JWT from Supabase Auth)
**RLS:** Verify application.organization_id matches user's org

**Request:**
```typescript
GET /api/applications/123e4567-e89b-12d3-a456-426614174000/details
```

**Response:**
```typescript
{
  business_info: {
    id: "uuid",
    name: "H2 Build, INC.",
    status: "active",
    created_at: "2024-10-01T...",
    ein: "12-3456789",
    address: "123 Main St...",
    contact_name: "John Doe",
    contact_email: "john@h2build.com"
  },
  monthly_data: {
    "2024-10": {
      accounts: [
        {
          account_number: "3618057067",
          bank_name: "Boeing Employees' Credit Union",
          statement_date: "2024-10-31",
          start_balance: 901.56,
          end_balance: 12959.31,
          transactions: [
            {
              date: "2024-10-01",
              description: "DEPOSIT",
              amount: 5000.00,
              type: "credit",
              balance: 5901.56,
              category: "deposit"
            }
            // ... 39 more transactions
          ],
          totals: {
            credits: 31818.93,
            debits: 19761.67,
            net: 12057.26,
            transaction_count: 40
          }
        }
      ],
      monthly_totals: {
        credits: 31818.93,
        debits: 19761.67,
        net: 12057.26
      }
    },
    "2024-09": {
      // ... same structure
    }
  },
  debts_detected: [
    {
      creditor_name: "IRS",
      debt_type: "tax_lien",
      current_balance: 50000.00,
      status: "active"
    }
  ]
}
```

**Database Query Strategy:**
```sql
-- Step 1: Get business info
SELECT b.*, a.status, a.created_at
FROM applications a
JOIN businesses b ON a.business_id = b.id
WHERE a.id = $1 AND a.organization_id = $2;

-- Step 2: Get all statements with transactions
SELECT
  s.id,
  s.account_number,
  s.bank_name,
  s.statement_date,
  s.start_balance,
  s.end_balance,
  s.total_credits,
  s.total_debits,
  s.raw_transactions,
  DATE_TRUNC('month', s.statement_date) as month
FROM statements s
WHERE s.application_id = $1
ORDER BY s.statement_date DESC;

-- Step 3: Transform in API layer
// Group by month, then by account within month
// Extract transactions from raw_transactions JSONB
// Calculate monthly totals by summing account totals
```

**Implementation Notes:**
- API layer does the month/account grouping (not database)
- JSONB transactions extracted and formatted in API layer
- Use TypeScript to ensure type safety matches component interfaces

---

### 3.3 POST /api/statements/upload
**Purpose:** Accept JSON from extraction service
**Authentication:** API Key (from extraction service)
**RLS:** N/A (uses service role key)

**Request:**
```typescript
POST /api/statements/upload
Content-Type: application/json
X-API-Key: <secret-key>

{
  "statement": {
    "summary": {
      "account_number": "3618057067",
      "bank_name": "Boeing Employees' Credit Union",
      "company": "H2 Build, INC.",
      "start_balance": 901.56,
      "end_balance": 12959.31,
      "total_credits": 31818.93,
      "total_debits": 19761.67,
      "num_transactions": 40,
      "statement_date": "2024-10-31"
    },
    "transactions": [
      {
        "date": "2024-10-01",
        "description": "DEPOSIT",
        "amount": 5000.00,
        "type": "credit",
        "balance": 5901.56
      }
      // ... 39 more
    ]
  }
}
```

**Response:**
```typescript
{
  "success": true,
  "statement_id": "uuid",
  "requires_matching": true,  // If company not found
  "suggested_businesses": [
    {
      "id": "uuid",
      "name": "H2 Build Inc",
      "confidence": 0.85
    }
  ]
}
```

**Edge Function Logic:**
```typescript
// 1. Validate JSON structure
// 2. Look for existing business by exact name match
// 3. If found:
//    - Insert into statements table
//    - Refresh materialized view
//    - Return success
// 4. If not found:
//    - Search for similar names (ILIKE)
//    - Return requires_matching=true with suggestions
//    - Store JSON in temp table awaiting manual matching
```

---

### 3.4 POST /api/statements/:temp_id/match
**Purpose:** Complete manual business matching
**Authentication:** Required (JWT from Supabase Auth)

**Request:**
```typescript
POST /api/statements/temp-123/match
{
  "action": "create_new",  // or "link_existing"
  "business_id": "uuid"     // only if link_existing
}
```

**Response:**
```typescript
{
  "success": true,
  "statement_id": "uuid",
  "business_id": "uuid"
}
```

---

## 4. COMPONENT-TO-DATABASE MAPPING TABLE

| Component | Data Needed | API Endpoint | Database Tables | Transformation |
|-----------|-------------|--------------|-----------------|----------------|
| **Companies.tsx** | List of applications | GET /api/applications | applications, businesses, statements, debts | Aggregate counts, sum debts |
| **CompanyDetail.tsx** | Full company view | GET /api/applications/:id/details | applications, businesses, statements, debts | Group by month → account, extract JSONB |
| **CompanyHeader.tsx** | Business info | (from CompanyDetail) | businesses | Pass-through from parent |
| **MonthlyActivityChart.tsx** | Monthly totals | (from CompanyDetail) | account_monthly_rollups | Pre-calculated in materialized view |
| **AccountList.tsx** | Accounts per month | (from CompanyDetail) | statements | Group statements by account |
| **TransactionList.tsx** | Individual transactions | (from CompanyDetail) | statements.raw_transactions | Extract from JSONB array |
| **DebtSummary.tsx** | Detected debts | (from CompanyDetail) | debts, debt_payments | Join debts with payments |
| **StatementUpload.tsx** | Upload form | POST /api/statements/upload | statements (temp) | Validate, store, request matching |
| **BusinessMatcher.tsx** | Matching UI | POST /api/statements/:id/match | businesses, statements | Create or link business |

**Key Insight:** Only 2 new API endpoints needed! Everything else uses data from CompanyDetail response.

---

## 5. IMPLEMENTATION SEQUENCE

### Phase 1: Foundation (Week 1)
**Goal:** Set up integration layer

**Tasks:**
1. ✅ Create `.env` file with Supabase credentials
   ```bash
   VITE_SUPABASE_URL=https://your-project.supabase.co
   VITE_SUPABASE_ANON_KEY=your-anon-key
   SUPABASE_SERVICE_ROLE_KEY=your-service-key
   ```

2. ✅ Create `src/lib/supabaseClient.ts`
   ```typescript
   import { createClient } from '@supabase/supabase-js';

   const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
   const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

   export const supabase = createClient(supabaseUrl, supabaseAnonKey);
   ```

3. ✅ Create `src/services/api.ts` with TypeScript interfaces
   - Import interfaces from mock data files
   - Define API service class with methods for each endpoint
   - Add error handling and loading states

4. ✅ Update `src/hooks/useAuth.tsx` to use real Supabase Auth
   - Replace mock authentication
   - Use `supabase.auth.signInWithPassword()`
   - Handle session management

**Acceptance Criteria:**
- Can connect to Supabase from React app
- TypeScript interfaces match database schema
- Authentication works (can log in)

---

### Phase 2: Read-Only API (Week 2)
**Goal:** Get existing data flowing to dashboard

**Tasks:**
1. ✅ Implement GET /api/applications
   - Create Edge Function or use Supabase client directly
   - Test with existing data in database
   - Add pagination support

2. ✅ Implement GET /api/applications/:id/details
   - Build month/account grouping logic
   - Extract transactions from JSONB
   - Test response matches CompanyDetail expectations

3. ✅ Update Companies.tsx to use real API
   - Replace `mockApplications` import
   - Add loading skeleton
   - Add error boundary

4. ✅ Update CompanyDetail.tsx to use real API
   - Replace `mockCompanyData` import
   - Verify child components still work
   - Add loading states

**Acceptance Criteria:**
- Dashboard displays real data from database
- No TypeScript errors
- Loading states work correctly
- <2s page load time

---

### Phase 3: Write API (Week 3)
**Goal:** Enable statement upload

**Tasks:**
1. ✅ Create Edge Function for POST /api/statements/upload
   ```typescript
   // supabase/functions/statements-upload/index.ts
   import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

   serve(async (req) => {
     // 1. Validate API key
     // 2. Parse JSON body
     // 3. Validate structure
     // 4. Check for existing business
     // 5. Insert or request matching
   });
   ```

2. ✅ Add database trigger to refresh materialized view
   ```sql
   CREATE OR REPLACE FUNCTION refresh_monthly_rollups()
   RETURNS TRIGGER AS $$
   BEGIN
     REFRESH MATERIALIZED VIEW CONCURRENTLY account_monthly_rollups;
     RETURN NEW;
   END;
   $$ LANGUAGE plpgsql;

   CREATE TRIGGER statement_inserted
   AFTER INSERT ON statements
   FOR EACH STATEMENT
   EXECUTE FUNCTION refresh_monthly_rollups();
   ```

3. ✅ Test with example_json_output file
   - POST JSON to upload endpoint
   - Verify statement appears in database
   - Verify dashboard shows new statement

**Acceptance Criteria:**
- Can upload JSON successfully
- Data appears in dashboard immediately
- Materialized view updates automatically

---

### Phase 4: Entity Resolution UI (Week 4)
**Goal:** Manual business matching

**Tasks:**
1. ✅ Create BusinessMatcher.tsx component
   - Show new company name
   - Display suggested matches
   - "Create New" vs "Link Existing" buttons

2. ✅ Implement POST /api/statements/:id/match
   - Create new business if needed
   - Link statement to business
   - Update application record

3. ✅ Add to onboarding flow
   - Show matcher after statement upload
   - Block until matching complete
   - Redirect to company detail after

**Acceptance Criteria:**
- Can create new businesses from UI
- Can link to existing businesses
- No duplicate businesses created accidentally

---

### Phase 5: Testing & Optimization (Week 5)
**Goal:** Production readiness

**Tasks:**
1. ✅ Performance testing
   - Load test API endpoints
   - Verify <2s page load
   - Add database indexes if needed

2. ✅ Error handling
   - Test network failures
   - Test invalid JSON uploads
   - Add user-friendly error messages

3. ✅ Documentation
   - API documentation for external services
   - Component integration guide
   - Database maintenance procedures

**Acceptance Criteria:**
- All performance targets met
- Error handling complete
- Documentation written

---

## 6. PERFORMANCE ANALYSIS

### 6.1 Query Performance Targets

| Endpoint | Target | Expected | Strategy |
|----------|--------|----------|----------|
| GET /applications | <500ms | ~200ms | Index on applications.organization_id, created_at |
| GET /applications/:id/details | <2000ms | ~800ms | Materialized view + JSONB GIN index |
| POST /statements/upload | <3000ms | ~1500ms | Async processing, return before view refresh |

### 6.2 Optimization Strategies

**Already Implemented in Schema:**
- ✅ Materialized view for aggregates
- ✅ RLS policies for multi-tenant security
- ✅ Foreign key indexes

**Recommended Additions:**
```sql
-- GIN index for JSONB queries (if needed later)
CREATE INDEX idx_statements_raw_transactions
ON statements USING GIN (raw_transactions);

-- Index for statement date queries
CREATE INDEX idx_statements_date
ON statements (statement_date DESC);

-- Composite index for monthly rollups
CREATE INDEX idx_rollups_org_month
ON account_monthly_rollups (organization_id, month DESC);
```

### 6.3 Scalability Projections

| Metric | Current | 1 Year | 5 Years | Mitigation |
|--------|---------|--------|---------|------------|
| Applications | 10 | 1,000 | 10,000 | Pagination working |
| Statements per app | 5 | 60 | 300 | JSONB handles this |
| Transactions per statement | 40 | 100 | 200 | Still <2s with indexes |
| Database size | 10MB | 500MB | 5GB | Supabase scales to 500GB+ |

**Conclusion:** Architecture scales to 5+ years without major changes.

---

## 7. RISK ASSESSMENT

### 7.1 Technical Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| JSONB queries slow with growth | Medium | Medium | Monitor performance, normalize if needed (schema change is easy) |
| Materialized view refresh lag | Low | Low | Refresh on insert (statements are infrequent, <1/minute) |
| API payload too large | Low | Medium | Add pagination to statements (50 per page) |
| Component breaks with API mismatch | Low | High | TypeScript interfaces as contracts, integration tests |

### 7.2 Business Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Entity resolution creates duplicates | Medium | High | Manual matching UI, preview before creation |
| Wrong business linked | Low | High | Show statement preview in matching UI, allow unlinking |
| Data loss during upload | Low | Critical | Store raw JSON in temp table, don't delete until confirmed |

### 7.3 Operational Risks

| Risk | Likelihood | Impact | Mitigation |
|------|------------|--------|------------|
| Supabase outage | Low | High | Monitor uptime, have backup export process |
| API key leaked | Medium | High | Rotate keys regularly, use Supabase API key management |
| RLS policy misconfigured | Low | Critical | Test with multiple org users, automated security tests |

**Overall Risk Level:** **LOW** - Architecture is conservative and follows PostgreSQL best practices.

---

## 8. NON-NEGOTIABLE CONSTRAINTS

✅ **Verified Against Architecture:**

1. **Performance:** Dashboard page load <2 seconds
   - ✅ Materialized views pre-calculate aggregates
   - ✅ Single API call per page
   - ✅ Pagination reduces payload size

2. **Scalability:** Support 10,000+ applications
   - ✅ PostgreSQL handles this easily
   - ✅ Indexes on all foreign keys
   - ✅ Pagination implemented

3. **Security:** Row Level Security (RLS) on all tables
   - ✅ Already in database schema
   - ✅ Filters by organization_id
   - ✅ Enforced at database level

4. **Accuracy:** Financial calculations must be exact
   - ✅ All calculations server-side
   - ✅ Components do zero math
   - ✅ Pre-calculated in JSON extraction

5. **Auditability:** Preserve original JSON
   - ✅ raw_transactions JSONB field
   - ✅ Never modified after insert
   - ✅ Full audit trail

6. **Maintainability:** Minimize complexity
   - ✅ No normalization (simpler)
   - ✅ Dumb components (no logic)
   - ✅ Standard REST API (no GraphQL overhead)

7. **Multi-tenancy:** Organization-based isolation
   - ✅ RLS policies enforce this
   - ✅ Every table has organization_id
   - ✅ Cannot query other org's data

8. **Developer Experience:** TypeScript end-to-end
   - ✅ Interfaces from mock data
   - ✅ Type-safe API responses
   - ✅ Supabase has TypeScript support

---

## 9. MIGRATION PLAN (Zero Downtime)

Since dashboard currently uses mock data, migration is **risk-free**:

### Step 1: Deploy API Layer
- Deploy Edge Functions
- Deploy API service layer
- **Dashboard still uses mock data**

### Step 2: Parallel Run
- Add feature flag: `USE_REAL_API`
- Test with real data in dev environment
- Compare results with mock data

### Step 3: Gradual Rollout
- Enable for internal users first
- Monitor for errors
- Enable for 10% of users
- Enable for 50% of users
- Enable for 100% of users

### Step 4: Cleanup
- Remove mock data files
- Remove feature flag
- Update documentation

**Rollback Plan:** Flip feature flag back to mock data.

---

## 10. DECISION AUTHORITY SIGN-OFF

**Recommended by:** System Architect (Claude Code)
**Date:** October 16, 2025
**Status:** **APPROVED FOR IMPLEMENTATION**

**Key Decisions Summary:**
1. ✅ JSONB storage for transactions (no normalization)
2. ✅ Pre-calculate aggregates (materialized views)
3. ✅ Nested JSON API responses (matches components)
4. ✅ Manual entity resolution (accuracy over speed)
5. ✅ Upfront data loading (with pagination)

**Database Schema Status:** ✅ **NO CHANGES REQUIRED**
**Implementation Priority:** ✅ **START IMMEDIATELY**

---

## APPENDIX A: Quick Reference

### File Locations
- **JSON Example:** `clearscrub_dashboard/database/schema/example_json_output_*.json`
- **Database Schema:** `clearscrub_dashboard/database/schema/database-schema-complete.md`
- **Component Docs:** `COMPONENT_ARCHITECTURE_COMPLETE.md`
- **Integration Agent:** `.claude/agents/integration-orchestrator.md`

### Key SQL Queries
```sql
-- Get company detail data
SELECT * FROM account_monthly_rollups
WHERE organization_id = $1
ORDER BY month DESC;

-- Get statement with transactions
SELECT raw_transactions FROM statements WHERE id = $1;

-- Refresh materialized view manually
REFRESH MATERIALIZED VIEW CONCURRENTLY account_monthly_rollups;
```

### Key TypeScript Interfaces
```typescript
// From CompanyDetail mock data
interface MonthlyData {
  [month: string]: {
    accounts: AccountData[];
  };
}

interface AccountData {
  account_number: string;
  bank_name: string;
  transactions: Transaction[];
  totals: {
    credits: number;
    debits: number;
    net: number;
  };
}
```

---

## APPENDIX B: Testing Checklist

### Unit Tests
- [ ] API service methods
- [ ] JSONB extraction logic
- [ ] Month/account grouping
- [ ] Entity name matching

### Integration Tests
- [ ] Upload JSON → appears in dashboard
- [ ] Create business → statement links correctly
- [ ] RLS policies block cross-org access
- [ ] Materialized view refreshes on insert

### Performance Tests
- [ ] GET /applications with 10,000 records
- [ ] GET /applications/:id/details with 100 statements
- [ ] POST /statements/upload with 200 transactions
- [ ] Concurrent API requests (100 users)

### Security Tests
- [ ] Invalid API key rejected
- [ ] JWT token validation
- [ ] RLS prevents org data leakage
- [ ] SQL injection attempts blocked

---

**END OF ARCHITECTURAL DECISIONS DOCUMENT**
