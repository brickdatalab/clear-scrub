# ClearScrub Edge Functions

## Overview

ClearScrub uses Supabase Edge Functions (Deno-based) for document processing, API integrations, and background jobs.

**Project URL:** https://vnhauomvzjucxadrbywg.supabase.co

---

## Deployed Functions

### Document Processing Pipeline

| Function | JWT | Purpose |
|----------|-----|---------|
| classify-document | No | Classifies uploaded files (bank_statement, application, etc.) |
| extract-bank-statement | No | Extracts structured data from bank statements |
| extract-application | No | Extracts loan application data from forms |
| process-document | No | Orchestrates the full document processing pipeline |

### API Endpoints

| Function | JWT | Purpose |
|----------|-----|---------|
| list-companies | Yes | Lists companies/submissions for dashboard |
| get-company-detail | Yes | Gets detailed company/submission data |
| get-statement-transactions | Yes | Gets transactions for a statement |
| get-company-debts | Yes | Gets debt analysis for a company |

### Testing/Utilities

| Function | JWT | Purpose |
|----------|-----|---------|
| test-classify | No | Testing endpoint for classification |
| test-webhook | No | Webhook testing endpoint |

---

## Function Templates

### Basic Authenticated Function

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's token
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: { headers: { Authorization: authHeader } }
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's org_id
    const { data: profile } = await supabase
      .from('profiles')
      .select('org_id')
      .eq('id', user.id)
      .single();

    if (!profile?.org_id) {
      return new Response(
        JSON.stringify({ error: 'User not associated with organization' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Your logic here
    const result = { message: 'Success', org_id: profile.org_id };

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Function error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
```

### Service Role Function (No JWT)

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    const body = await req.json();

    // Service role client bypasses RLS
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Your processing logic here
    const { file_id, org_id } = body;

    // Update with service role
    const { error } = await supabaseAdmin
      .from('files')
      .update({ status: 'processing' })
      .eq('id', file_id);

    if (error) throw error;

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Processing error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

### Webhook Handler

```typescript
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req: Request) => {
  try {
    // Verify webhook signature (if applicable)
    const signature = req.headers.get('x-webhook-signature');
    const body = await req.text();

    // TODO: Verify signature against secret

    const payload = JSON.parse(body);

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Process webhook payload
    console.log('Webhook received:', payload);

    return new Response(
      JSON.stringify({ received: true }),
      { headers: { 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
```

---

## Document Processing Pattern

### classify-document

Classifies uploaded files into categories.

```typescript
// POST /functions/v1/classify-document
// Body: { file_id: string }

// Response:
{
  "classification_type": "bank_statement" | "application" | "other",
  "classification_confidence": 0.95
}
```

### extract-bank-statement

Extracts structured data from bank statements.

```typescript
// POST /functions/v1/extract-bank-statement
// Body: { file_id: string }

// Creates/updates:
// - accounts record
// - bank_statements record
// - transactions records

// Response:
{
  "success": true,
  "account_id": "uuid",
  "statement_id": "uuid",
  "transaction_count": 42
}
```

### extract-application

Extracts loan application data.

```typescript
// POST /functions/v1/extract-application
// Body: { file_id: string }

// Creates:
// - applications record

// Response:
{
  "success": true,
  "application_id": "uuid",
  "confidence_score": 0.87,
  "uncertain_fields": ["owner_1_ssn", "company_ein"]
}
```

### process-document (Orchestrator)

Full pipeline orchestration.

```typescript
// POST /functions/v1/process-document
// Body: { file_id: string }

// Steps:
// 1. Update file status to 'processing'
// 2. Call classify-document
// 3. Based on classification:
//    - bank_statement -> call extract-bank-statement
//    - application -> call extract-application
// 4. Update file status to 'processed' or 'failed'
// 5. Update submission status if all files processed
```

---

## Calling Edge Functions

### From Client (JavaScript)

```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  'https://vnhauomvzjucxadrbywg.supabase.co',
  'your-anon-key'
);

// For authenticated functions
const { data, error } = await supabase.functions.invoke('list-companies', {
  body: { limit: 10 }
});

// For service functions (needs service role in backend)
const response = await fetch(
  'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/process-document',
  {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${serviceRoleKey}`
    },
    body: JSON.stringify({ file_id: 'uuid' })
  }
);
```

### From Database Trigger

```sql
-- Trigger function to call Edge Function
CREATE OR REPLACE FUNCTION public.trigger_process_document()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  response json;
BEGIN
  -- Call Edge Function via pg_net extension
  SELECT net.http_post(
    url := 'https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/process-document',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.service_role_key')
    ),
    body := jsonb_build_object('file_id', NEW.id)
  ) INTO response;

  RETURN NEW;
END;
$$;
```

---

## Environment Variables

Edge Functions have access to these environment variables:

| Variable | Description |
|----------|-------------|
| SUPABASE_URL | Project URL (https://vnhauomvzjucxadrbywg.supabase.co) |
| SUPABASE_ANON_KEY | Anon key for client-side auth |
| SUPABASE_SERVICE_ROLE_KEY | Service role key (bypasses RLS) |
| SUPABASE_DB_URL | Direct database connection string |

Custom secrets can be set via:
```bash
supabase secrets set MY_API_KEY=value
```

---

## Deployment

### Using MCP Tool

```typescript
// Deploy via mcp__supabase-vin__deploy_edge_function
{
  project_id: "vnhauomvzjucxadrbywg",
  name: "my-function",
  files: [
    { name: "index.ts", content: "..." }
  ],
  verify_jwt: true  // Require authentication
}
```

### Using CLI

```bash
# Deploy single function
supabase functions deploy my-function --project-ref vnhauomvzjucxadrbywg

# Deploy all functions
supabase functions deploy --project-ref vnhauomvzjucxadrbywg
```

---

## Error Handling Best Practices

```typescript
// Structured error responses
interface ErrorResponse {
  error: string;
  code?: string;
  details?: unknown;
}

function errorResponse(
  message: string,
  status: number,
  code?: string
): Response {
  return new Response(
    JSON.stringify({
      error: message,
      code,
      timestamp: new Date().toISOString()
    }),
    {
      status,
      headers: { 'Content-Type': 'application/json' }
    }
  );
}

// Usage
if (!file_id) {
  return errorResponse('Missing file_id', 400, 'MISSING_PARAM');
}
```

---

## Logging

```typescript
// Structured logging for debugging
console.log(JSON.stringify({
  level: 'info',
  function: 'process-document',
  file_id: 'uuid',
  step: 'classification_complete',
  result: 'bank_statement',
  duration_ms: 1234
}));

// View logs in Supabase Dashboard or via CLI
// supabase functions logs --project-ref vnhauomvzjucxadrbywg
```
