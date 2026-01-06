#!/bin/bash

# ClearScrub TypeScript Types Generator
# Project: vnhauomvzjucxadrbywg
# URL: https://vnhauomvzjucxadrbywg.supabase.co

set -e

# Configuration
PROJECT_REF="vnhauomvzjucxadrbywg"
OUTPUT_FILE="${1:-./src/lib/database.types.ts}"

echo "Generating TypeScript types for ClearScrub..."
echo "Project: $PROJECT_REF"
echo "Output: $OUTPUT_FILE"

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "Error: Supabase CLI not installed."
    echo "Install with: brew install supabase/tap/supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "Not logged in. Running 'supabase login'..."
    supabase login
fi

# Generate types
echo "Fetching schema and generating types..."
supabase gen types typescript \
    --project-id "$PROJECT_REF" \
    > "$OUTPUT_FILE"

echo "Types generated successfully: $OUTPUT_FILE"

# Optional: Add helper types
cat >> "$OUTPUT_FILE" << 'EOF'

// Helper types for ClearScrub
export type Tables = Database['public']['Tables'];
export type Enums = Database['public']['Enums'];

// Table row types
export type Organization = Tables['organizations']['Row'];
export type Profile = Tables['profiles']['Row'];
export type ApiKey = Tables['api_keys']['Row'];
export type Submission = Tables['submissions']['Row'];
export type File = Tables['files']['Row'];
export type Account = Tables['accounts']['Row'];
export type BankStatement = Tables['bank_statements']['Row'];
export type Transaction = Tables['transactions']['Row'];
export type Category = Tables['categories']['Row'];
export type Application = Tables['applications']['Row'];
export type SubmissionMetrics = Tables['submission_metrics']['Row'];
export type Webhook = Tables['webhooks']['Row'];
export type AuditLog = Tables['audit_log']['Row'];

// Insert types
export type OrganizationInsert = Tables['organizations']['Insert'];
export type ProfileInsert = Tables['profiles']['Insert'];
export type ApiKeyInsert = Tables['api_keys']['Insert'];
export type SubmissionInsert = Tables['submissions']['Insert'];
export type FileInsert = Tables['files']['Insert'];
export type AccountInsert = Tables['accounts']['Insert'];
export type BankStatementInsert = Tables['bank_statements']['Insert'];
export type TransactionInsert = Tables['transactions']['Insert'];
export type ApplicationInsert = Tables['applications']['Insert'];
export type WebhookInsert = Tables['webhooks']['Insert'];

// Update types
export type OrganizationUpdate = Tables['organizations']['Update'];
export type ProfileUpdate = Tables['profiles']['Update'];
export type ApiKeyUpdate = Tables['api_keys']['Update'];
export type SubmissionUpdate = Tables['submissions']['Update'];
export type FileUpdate = Tables['files']['Update'];
export type AccountUpdate = Tables['accounts']['Update'];
export type BankStatementUpdate = Tables['bank_statements']['Update'];
export type TransactionUpdate = Tables['transactions']['Update'];
export type ApplicationUpdate = Tables['applications']['Update'];
export type WebhookUpdate = Tables['webhooks']['Update'];

// Enum types (if defined in database)
export type IngestionMethod = 'api' | 'dashboard' | 'email';
export type SubmissionStatus = 'received' | 'processing' | 'completed' | 'failed';
export type FileStatus = 'uploaded' | 'classifying' | 'classified' | 'processing' | 'processed' | 'failed';
export type ClassificationType = 'bank_statement' | 'application' | 'loan_application' | 'month_to_date' | 'other';
export type AccountType = 'checking' | 'savings' | 'money_market' | 'unknown';
export type AnalyticsGroup = 'revenue' | 'cogs' | 'opex' | 'debt' | 'equity' | 'intra_company' | 'tax' | 'special_items';
export type SubscriptionTier = 'free' | 'basic' | 'pro' | 'enterprise';
export type OrgStatus = 'active' | 'suspended' | 'cancelled';
export type WebhookStatus = 'active' | 'inactive' | 'failed';
EOF

echo "Helper types appended."
echo "Done!"
