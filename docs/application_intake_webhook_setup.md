# Application Intake Webhook - Complete Setup Guide

This guide covers the complete setup for ingesting loan application data from n8n (after Haiku extraction) into Supabase.

---

## PART 1: Database Migration

Run this SQL migration first to add the necessary tables and columns.

### Migration SQL

```sql
-- ============================================================================
-- APPLICATION INTAKE SCHEMA - Phase 2 Migration
-- Adds support for loan application document ingestion
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. ALTER owners table - Add missing fields from v2 schema
-- ----------------------------------------------------------------------------

ALTER TABLE owners
ADD COLUMN IF NOT EXISTS middle_name TEXT,
ADD COLUMN IF NOT EXISTS home_phone TEXT;

COMMENT ON COLUMN owners.middle_name IS 'Middle name or initial of owner';
COMMENT ON COLUMN owners.home_phone IS 'Home/landline phone number (separate from cell_phone)';

-- ----------------------------------------------------------------------------
-- 2. CREATE applications table - Store loan application submissions
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS applications (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Key
  company_id UUID NOT NULL REFERENCES companies(id) ON DELETE CASCADE,

  -- Submission Tracking
  submission_id UUID,                              -- OPTIONAL: Links application to bank statements in same submission
  document_id UUID UNIQUE,                         -- OPTIONAL: Unique ID for this application document
  confidence_score NUMERIC(3,2) CHECK (confidence_score >= 0 AND confidence_score <= 1), -- 0.00 to 1.00

  -- Business Details
  business_structure TEXT CHECK (business_structure IN (
    'Sole Proprietorship',
    'Partnership',
    'LLC',
    'Corporation',
    'S-Corp',
    'C-Corp',
    'Non-Profit',
    'Other'
  )),
  start_date DATE,                                 -- Business establishment date
  years_in_business NUMERIC(5,2),                  -- Can be decimal (e.g., 2.5 years)
  number_of_employees INTEGER CHECK (number_of_employees >= 1),
  annual_revenue NUMERIC(15,2),                    -- Pure numeric, no $ or commas

  -- Funding Request
  amount_requested NUMERIC(15,2),                  -- Requested loan amount
  loan_purpose TEXT,                                -- Why they need the funding

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_applications_company_id ON applications(company_id);
CREATE INDEX IF NOT EXISTS idx_applications_submission_id ON applications(submission_id) WHERE submission_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_document_id ON applications(document_id) WHERE document_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_applications_created_at ON applications(created_at DESC);

-- Row Level Security
ALTER TABLE applications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view applications for their companies"
ON applications FOR SELECT
USING (company_id IN (
  SELECT company_id FROM user_companies WHERE user_id = auth.uid()
));

CREATE POLICY "Service role can insert applications"
ON applications FOR INSERT
WITH CHECK (true);  -- Service role bypasses RLS

-- Comments
COMMENT ON TABLE applications IS 'Loan application submissions with funding request details';
COMMENT ON COLUMN applications.submission_id IS 'UUID linking this application to bank statements from the same submission batch';
COMMENT ON COLUMN applications.document_id IS 'Unique identifier for this specific application document';
COMMENT ON COLUMN applications.confidence_score IS 'Extraction quality score from AI extraction (0.0-1.0)';

-- ----------------------------------------------------------------------------
-- 3. CREATE application_owners junction table
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS application_owners (
  -- Primary Key
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Foreign Keys
  application_id UUID NOT NULL REFERENCES applications(id) ON DELETE CASCADE,
  owner_id UUID NOT NULL REFERENCES owners(id) ON DELETE CASCADE,

  -- Ownership Details
  ownership_percentage NUMERIC(5,2) CHECK (ownership_percentage >= 0 AND ownership_percentage <= 100),

  -- Timestamp
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Constraints
  UNIQUE(application_id, owner_id)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_application_owners_application_id ON application_owners(application_id);
CREATE INDEX IF NOT EXISTS idx_application_owners_owner_id ON application_owners(owner_id);

-- Row Level Security
ALTER TABLE application_owners ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users view application owners for their companies"
ON application_owners FOR SELECT
USING (application_id IN (
  SELECT id FROM applications
  WHERE company_id IN (
    SELECT company_id FROM user_companies WHERE user_id = auth.uid()
  )
));

CREATE POLICY "Service role can insert application owners"
ON application_owners FOR INSERT
WITH CHECK (true);

-- Comments
COMMENT ON TABLE application_owners IS 'Junction table linking applications to their owners with ownership percentages';

-- ============================================================================
-- End of migration
-- ============================================================================
```

### Run the Migration

```bash
# From your project root
cd /Users/vitolo/Desktop/clearscrub_main/clearscrub_dashboard

# Apply migration (assuming you have Supabase CLI configured)
# Option 1: Via Supabase dashboard SQL editor - paste the SQL above
# Option 2: Via CLI (if you have a migrations folder)
# supabase migration new application_intake_phase2
# Then paste the SQL and run: supabase db push
```

---

## PART 2: Test Curl Statement

Use this to test the webhook endpoint directly (standalone, no n8n).

### Complete Curl Command

```bash
curl -X POST \
  https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123" \
  -d '{
  "company": {
    "legal_name": "ACME Corporation",
    "dba_name": null,
    "ein": "12-3456789",
    "industry": "Manufacturing",
    "address_line1": "123 Business Blvd",
    "address_line2": "Suite 100",
    "city": "Chicago",
    "state": "IL",
    "zip": "60601",
    "phone": "3125551234",
    "email": "info@acme.com",
    "website": "www.acme.com"
  },
  "application": {
    "submission_id": null,
    "document_id": null,
    "business_structure": "Corporation",
    "start_date": "2015-03-15",
    "years_in_business": 9.8,
    "number_of_employees": 45,
    "annual_revenue": 5500000,
    "amount_requested": 250000,
    "loan_purpose": "Equipment purchase and expansion",
    "owner_1_first_name": "John",
    "owner_1_middle_name": "Michael",
    "owner_1_last_name": "Smith",
    "owner_1_ssn": "123-45-6789",
    "owner_1_dob": "1975-06-20",
    "owner_1_ownership_pct": 60,
    "owner_1_address": {
      "address_line1": "456 Residential St",
      "address_line2": "Apt 3B",
      "city": "Chicago",
      "state": "IL",
      "zip": "60602"
    },
    "owner_1_cell_phone": "3125559876",
    "owner_1_home_phone": null,
    "owner_1_email": "john.smith@email.com",
    "owner_2_first_name": "Jane",
    "owner_2_middle_name": null,
    "owner_2_last_name": "Doe",
    "owner_2_ssn": "987-65-4321",
    "owner_2_dob": "1980-09-15",
    "owner_2_ownership_pct": 40,
    "owner_2_address": {
      "address_line1": "789 Oak Avenue",
      "address_line2": null,
      "city": "Evanston",
      "state": "IL",
      "zip": "60201"
    },
    "owner_2_cell_phone": "8475551234",
    "owner_2_home_phone": "8475555678",
    "owner_2_email": "jane.doe@email.com"
  },
  "confidence_score": 0.92
}'
```

### Expected Response (Success)

```json
{
  "success": true,
  "data": {
    "application_id": "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    "company_id": "c0d3f4a5-b6e7-8901-cdef-234567890abc",
    "submission_id": "f9e8d7c6-b5a4-3210-9876-543210fedcba",
    "document_id": "d8c7b6a5-9483-7261-5049-382716059483",
    "owner_ids": [
      "o1a2b3c4-d5e6-f789-0abc-def123456789",
      "o9f8e7d6-c5b4-a321-0987-654321fedcba"
    ],
    "matched_company": true,
    "matched_owners": [true, false]
  },
  "message": "Application intake successful"
}
```

### Expected Response (Error)

```json
{
  "success": false,
  "error": "Missing required field: company.legal_name",
  "details": {
    "field": "company.legal_name",
    "value": null
  }
}
```

---

## PART 3: n8n HTTP Request Node Configuration

Add this HTTP Request node after your Code Node (that cleans the Haiku response).

### n8n HTTP Request Node Settings

**Authentication:** None (webhook secret in headers)
**Method:** POST
**URL:** `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake`

**Headers:**
```
Content-Type: application/json
X-Webhook-Secret: clearscrub_webhook_2025_xyz123
```

**Body (JSON):**
```
{{ $json }}
```

**Notes:**
- The `{{ $json }}` variable should contain the cleaned extraction result from your Code Node
- After the Code Node processes Haiku's response, `$json` will be the complete v2 schema object
- n8n will automatically serialize it as JSON

### Complete n8n Workflow

```
[Trigger: Webhook/File Upload]
    ↓
[PDF Text Extraction Node]
    ↓
[Anthropic Claude Node] (Haiku 4.5)
    ↓
[Code Node] (Strip markdown, parse JSON)
    ↓
[HTTP Request Node] (POST to application-schema-intake) ← YOU ARE HERE
    ↓
[Process Response] (Check success, get IDs)
```

---

## PART 4: Edge Function Implementation

Create the Supabase Edge Function to handle incoming application data.

### File Structure

```
supabase/
  functions/
    application-schema-intake/
      index.ts
```

### index.ts

```typescript
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const WEBHOOK_SECRET = "clearscrub_webhook_2025_xyz123";

interface Address {
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
}

interface Company {
  legal_name: string;
  dba_name: string | null;
  ein: string;
  industry: string | null;
  address_line1: string;
  address_line2: string | null;
  city: string;
  state: string;
  zip: string;
  phone: string | null;
  email: string | null;
  website: string | null;
}

interface Application {
  submission_id: string | null;
  document_id: string | null;
  business_structure: string | null;
  start_date: string | null;
  years_in_business: number | null;
  number_of_employees: number | null;
  annual_revenue: number | null;
  amount_requested: number | null;
  loan_purpose: string | null;
  owner_1_first_name: string;
  owner_1_middle_name: string | null;
  owner_1_last_name: string;
  owner_1_ssn: string | null;
  owner_1_dob: string | null;
  owner_1_ownership_pct: number | null;
  owner_1_address: Address | null;
  owner_1_cell_phone: string | null;
  owner_1_home_phone: string | null;
  owner_1_email: string | null;
  owner_2_first_name: string | null;
  owner_2_middle_name: string | null;
  owner_2_last_name: string | null;
  owner_2_ssn: string | null;
  owner_2_dob: string | null;
  owner_2_ownership_pct: number | null;
  owner_2_address: Address | null;
  owner_2_cell_phone: string | null;
  owner_2_home_phone: string | null;
  owner_2_email: string | null;
}

interface RequestBody {
  company: Company;
  application: Application;
  confidence_score: number | null;
}

serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Webhook-Secret",
      },
    });
  }

  // Only allow POST
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ success: false, error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    // Verify webhook secret
    const webhookSecret = req.headers.get("X-Webhook-Secret");
    if (webhookSecret !== WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid webhook secret" }),
        { status: 401, headers: { "Content-Type": "application/json" } }
      );
    }

    // Parse request body
    const body: RequestBody = await req.json();

    // Validate required fields
    if (!body.company?.legal_name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: company.legal_name",
          details: { field: "company.legal_name", value: body.company?.legal_name },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.company?.ein) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required field: company.ein",
          details: { field: "company.ein", value: body.company?.ein },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!body.application?.owner_1_first_name || !body.application?.owner_1_last_name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Missing required owner fields",
          details: {
            owner_1_first_name: body.application?.owner_1_first_name,
            owner_1_last_name: body.application?.owner_1_last_name,
          },
        }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role key (bypasses RLS)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // 1. Match or create company by EIN
    let companyId: string;
    let matchedCompany = false;

    const { data: existingCompany } = await supabase
      .from("companies")
      .select("id")
      .eq("ein", body.company.ein)
      .single();

    if (existingCompany) {
      companyId = existingCompany.id;
      matchedCompany = true;

      // Update company with latest data
      await supabase
        .from("companies")
        .update({
          business_legal_name: body.company.legal_name,
          dba: body.company.dba_name,
          street: body.company.address_line1,
          city: body.company.city,
          state: body.company.state,
          zip: body.company.zip,
          business_type: body.application.business_structure,
          industry: body.company.industry,
          business_start_date: body.application.start_date,
          updated_at: new Date().toISOString(),
        })
        .eq("id", companyId);
    } else {
      // Create new company
      const { data: newCompany, error: companyError } = await supabase
        .from("companies")
        .insert({
          business_legal_name: body.company.legal_name,
          dba: body.company.dba_name,
          ein: body.company.ein,
          street: body.company.address_line1,
          city: body.company.city,
          state: body.company.state,
          zip: body.company.zip,
          business_type: body.application.business_structure,
          industry: body.company.industry,
          business_start_date: body.application.start_date,
        })
        .select("id")
        .single();

      if (companyError || !newCompany) {
        throw new Error(`Failed to create company: ${companyError?.message}`);
      }

      companyId = newCompany.id;
    }

    // 2. Process owners
    const ownerIds: string[] = [];
    const matchedOwners: boolean[] = [];

    for (let i = 1; i <= 2; i++) {
      const firstName = i === 1 ? body.application.owner_1_first_name : body.application.owner_2_first_name;
      const middleName = i === 1 ? body.application.owner_1_middle_name : body.application.owner_2_middle_name;
      const lastName = i === 1 ? body.application.owner_1_last_name : body.application.owner_2_last_name;
      const ssn = i === 1 ? body.application.owner_1_ssn : body.application.owner_2_ssn;
      const dob = i === 1 ? body.application.owner_1_dob : body.application.owner_2_dob;
      const address = i === 1 ? body.application.owner_1_address : body.application.owner_2_address;
      const cellPhone = i === 1 ? body.application.owner_1_cell_phone : body.application.owner_2_cell_phone;
      const homePhone = i === 1 ? body.application.owner_1_home_phone : body.application.owner_2_home_phone;
      const email = i === 1 ? body.application.owner_1_email : body.application.owner_2_email;
      const ownershipPct = i === 1 ? body.application.owner_1_ownership_pct : body.application.owner_2_ownership_pct;

      // Skip if no name
      if (!firstName || !lastName) {
        if (i === 2) break; // Owner 2 is optional
        continue;
      }

      let ownerId: string;
      let matched = false;

      // Match by SSN if provided
      if (ssn) {
        const { data: existingOwner } = await supabase
          .from("owners")
          .select("id")
          .eq("ssn", ssn)
          .single();

        if (existingOwner) {
          ownerId = existingOwner.id;
          matched = true;

          // Update owner with latest data
          await supabase
            .from("owners")
            .update({
              first_name: firstName,
              middle_name: middleName,
              last_name: lastName,
              street: address?.address_line1,
              city: address?.city,
              state: address?.state,
              zip: address?.zip,
              date_of_birth: dob,
              email: email,
              cell_phone: cellPhone,
              home_phone: homePhone,
              updated_at: new Date().toISOString(),
            })
            .eq("id", ownerId);
        }
      }

      // Create new owner if not matched
      if (!matched) {
        const { data: newOwner, error: ownerError } = await supabase
          .from("owners")
          .insert({
            first_name: firstName,
            middle_name: middleName,
            last_name: lastName,
            street: address?.address_line1,
            city: address?.city,
            state: address?.state,
            zip: address?.zip,
            ssn: ssn,
            date_of_birth: dob,
            email: email,
            cell_phone: cellPhone,
            home_phone: homePhone,
          })
          .select("id")
          .single();

        if (ownerError || !newOwner) {
          throw new Error(`Failed to create owner ${i}: ${ownerError?.message}`);
        }

        ownerId = newOwner.id;
      }

      ownerIds.push(ownerId);
      matchedOwners.push(matched);

      // Link owner to company if not already linked
      const { data: existingLink } = await supabase
        .from("company_owners")
        .select("id")
        .eq("company_id", companyId)
        .eq("owner_id", ownerId)
        .single();

      if (!existingLink) {
        await supabase
          .from("company_owners")
          .insert({
            company_id: companyId,
            owner_id: ownerId,
            ownership_percentage: ownershipPct,
            is_primary: i === 1,
          });
      }
    }

    // 3. Generate UUIDs for submission and document if not provided
    const submissionId = body.application.submission_id || crypto.randomUUID();
    const documentId = body.application.document_id || crypto.randomUUID();

    // 4. Create application record
    const { data: newApplication, error: applicationError } = await supabase
      .from("applications")
      .insert({
        company_id: companyId,
        submission_id: submissionId,
        document_id: documentId,
        confidence_score: body.confidence_score,
        business_structure: body.application.business_structure,
        start_date: body.application.start_date,
        years_in_business: body.application.years_in_business,
        number_of_employees: body.application.number_of_employees,
        annual_revenue: body.application.annual_revenue,
        amount_requested: body.application.amount_requested,
        loan_purpose: body.application.loan_purpose,
      })
      .select("id")
      .single();

    if (applicationError || !newApplication) {
      throw new Error(`Failed to create application: ${applicationError?.message}`);
    }

    const applicationId = newApplication.id;

    // 5. Link owners to application
    for (let i = 0; i < ownerIds.length; i++) {
      const ownershipPct = i === 0 ? body.application.owner_1_ownership_pct : body.application.owner_2_ownership_pct;

      await supabase
        .from("application_owners")
        .insert({
          application_id: applicationId,
          owner_id: ownerIds[i],
          ownership_percentage: ownershipPct,
        });
    }

    // 6. Return success response
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          application_id: applicationId,
          company_id: companyId,
          submission_id: submissionId,
          document_id: documentId,
          owner_ids: ownerIds,
          matched_company: matchedCompany,
          matched_owners: matchedOwners,
        },
        message: "Application intake successful",
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Application intake error:", error);

    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});
```

---

## PART 5: Deployment Instructions

### Deploy the Edge Function

```bash
# Navigate to project root
cd /Users/vitolo/Desktop/clearscrub_main/clearscrub_dashboard

# Deploy the function
supabase functions deploy application-schema-intake --project-ref vnhauomvzjucxadrbywg

# Verify deployment
curl https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123"

# Expected: Method not allowed (confirms endpoint is live)
```

### Test the Endpoint

```bash
# Use the full curl statement from PART 2 above
# Should return success response with generated IDs
```

---

## PART 6: Response Format Reference

### Success Response Schema

```typescript
{
  success: true,
  data: {
    application_id: string;        // UUID of created application
    company_id: string;             // UUID of matched/created company
    submission_id: string;          // UUID linking to bank statements
    document_id: string;            // UUID for this application document
    owner_ids: string[];            // Array of owner UUIDs
    matched_company: boolean;       // true if existing company matched
    matched_owners: boolean[];      // [owner1_matched, owner2_matched]
  },
  message: string;
}
```

### Error Response Schema

```typescript
{
  success: false,
  error: string;                    // Human-readable error message
  details?: any;                    // Additional error context
}
```

---

## PART 7: Integration Checklist

### Pre-Deployment
- [x] Database migration applied
- [x] Edge function created
- [x] Webhook secret configured

### Testing
- [ ] Test curl statement works (standalone)
- [ ] Test with real extracted application data
- [ ] Verify company matching by EIN works
- [ ] Verify owner matching by SSN works
- [ ] Verify new company creation works
- [ ] Verify application_owners junction table populated

### n8n Integration
- [ ] HTTP Request node configured
- [ ] Test full workflow: Upload PDF → Extract → POST → Verify database
- [ ] Error handling added (check response.success)
- [ ] Downstream processing uses returned IDs

### Monitoring
- [ ] Check Supabase Edge Function logs for errors
- [ ] Monitor applications table for new records
- [ ] Verify owners and application_owners tables populated correctly

---

## PART 8: Troubleshooting

### Error: "Invalid webhook secret"
**Cause:** X-Webhook-Secret header missing or incorrect
**Solution:** Ensure header is exactly `clearscrub_webhook_2025_xyz123`

### Error: "Missing required field: company.legal_name"
**Cause:** Extraction failed or incomplete JSON sent
**Solution:** Check n8n Code Node output, verify Haiku extraction quality

### Error: "Failed to create company"
**Cause:** Database constraint violation (e.g., duplicate EIN)
**Solution:** Check Supabase logs, verify EIN uniqueness

### Company Not Matching Expected Record
**Cause:** EIN mismatch or normalization issue
**Solution:** Verify EIN format (XX-XXXXXXX), check extraction accuracy

### Owners Not Linked to Application
**Cause:** application_owners insert failed
**Solution:** Check Edge Function logs, verify owner_ids array populated

---

## Summary

**Endpoint URL:**
`https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/application-schema-intake`

**Authentication:**
`X-Webhook-Secret: clearscrub_webhook_2025_xyz123`

**Method:** POST

**Body:** Complete v2 schema JSON (from n8n Haiku extraction)

**Response:** Application ID, Company ID, Owner IDs, Submission ID

**Next Steps:** Integrate with n8n, test with real PDFs, monitor database
