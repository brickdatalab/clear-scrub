# Statement Schema Intake Webhook

## Overview
Edge function that receives bank statement extraction data from Flow.io and updates the documents table.

## Endpoint
```
POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake
```

## Authentication
Simple shared secret authentication via header:
```
X-Webhook-Secret: clearscrub_webhook_2025_xyz123
```

## Request Format
```json
{
  "document_id": "uuid-of-document-in-documents-table",
  "extracted_data": {
    "statement": {
      "summary": {
        "bank": "Bank Name",
        "account_number": "****1234",
        ...
      },
      "transactions": [
        {
          "date": "2025-10-01",
          "description": "Transaction description",
          "amount": 100.00,
          ...
        }
      ]
    }
  }
}
```

## Response Format

### Success (200)
```json
{
  "success": true,
  "document_id": "uuid",
  "status": "completed"
}
```

### Errors

**401 Unauthorized** - Missing or invalid webhook secret
```json
{
  "error": "Unauthorized - invalid or missing webhook secret"
}
```

**400 Bad Request** - Invalid JSON or missing required fields
```json
{
  "error": "Invalid JSON payload"
}
```
```json
{
  "error": "Missing required field: document_id"
}
```
```json
{
  "error": "Missing required field: extracted_data"
}
```

**404 Not Found** - Document doesn't exist
```json
{
  "error": "Document not found",
  "details": "No document found with id: <uuid>"
}
```

**500 Internal Server Error** - Database or server error
```json
{
  "error": "Database update failed",
  "details": "<error message>"
}
```

## What It Does

When called, the webhook:

1. Validates the `X-Webhook-Secret` header
2. Validates the JSON payload structure
3. Updates the `documents` table:
   - Sets `structured_json` = extracted_data
   - Sets `status` = 'completed'
   - Sets `structured_at` = current timestamp
   - Sets `processing_completed_at` = current timestamp
4. Returns success response with document_id

## Example cURL Command

```bash
curl -X POST https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake \
  -H "Content-Type: application/json" \
  -H "X-Webhook-Secret: clearscrub_webhook_2025_xyz123" \
  -d '{
    "document_id": "your-document-uuid-here",
    "extracted_data": {
      "statement": {
        "summary": {
          "bank": "Chase Bank",
          "account_number": "****5678",
          "statement_period": "2025-09-01 to 2025-09-30"
        },
        "transactions": [
          {
            "date": "2025-09-15",
            "description": "Direct Deposit - Payroll",
            "amount": 5000.00,
            "type": "credit"
          },
          {
            "date": "2025-09-16",
            "description": "Rent Payment",
            "amount": -2000.00,
            "type": "debit"
          }
        ]
      }
    }
  }'
```

## Security Notes

- **JWT Verification Disabled**: This function has `verify_jwt: false` because it's called by external service (Flow.io)
- **Service Role Key**: Uses Supabase service role key for database writes (bypasses RLS)
- **Secret Protection**: Webhook secret should be kept confidential and only shared with Flow.io

## Deployment

Deploy with:
```bash
supabase functions deploy statement-schema-intake --project-ref vnhauomvzjucxadrbywg --no-verify-jwt
```

## Flow.io Configuration

Configure Flow.io to POST to this endpoint with:
- URL: `https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/statement-schema-intake`
- Header: `X-Webhook-Secret: clearscrub_webhook_2025_xyz123`
- Method: POST
- Content-Type: application/json
