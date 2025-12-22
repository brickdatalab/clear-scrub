# ClearScrub

**Bank Statement Underwriting Platform for Lenders**

ClearScrub is a production-ready SaaS platform that automates bank statement analysis and loan application processing. The system ingests documents via API/dashboard/email, classifies and extracts structured data using AI, and provides financial analytics through a React dashboard.

---

## Quick Start

### Prerequisites
- Node.js 18+ and npm
- Supabase CLI (`npm install -g supabase`)
- Vercel CLI (`npm install -g vercel`)
- Supabase account with project ID: `vnhauomvzjucxadrbywg`

### Installation

```bash
# Clone the repository
cd clearscrub

# Install dashboard dependencies
cd clearscrub_dashboard
npm install

# Set up environment variables
cp .env.example .env
# Edit .env with your Supabase credentials
```

### Deployment

**Frontend (Dashboard):**
```bash
cd clearscrub_dashboard
vercel --prod
```

**Backend (Edge Functions):**
```bash
cd supabase
supabase functions deploy --project-ref vnhauomvzjucxadrbywg
```

---

## Project Structure

```
clearscrub/
├── clearscrub_dashboard/     # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/       # React components (shadcn/ui)
│   │   ├── pages/            # Route pages
│   │   ├── services/         # API service layer
│   │   ├── hooks/            # Custom React hooks
│   │   ├── lib/              # Utilities (Supabase client, etc.)
│   │   └── types/            # TypeScript interfaces
│   └── public/               # Static assets (fonts, logos)
│
├── supabase/                 # Backend infrastructure
│   ├── functions/            # Edge Functions (Deno)
│   │   ├── list-companies/
│   │   ├── get-company-detail/
│   │   ├── get-statement-transactions/
│   │   └── get-company-debts/
│   └── database/
│       ├── migrations/       # Versioned SQL migrations
│       ├── bank_schema_final.json      # Bank statement extraction schema
│       └── application_schema_final.json  # Application extraction schema
│
├── migration/                # Database migration documentation
│   ├── schema_reference.md   # Complete data architecture & JSON mappings
│   ├── clearscrub_migration.sql  # Full migration script (7 phases)
│   └── callback_processing.md    # Webhook handler SQL operations
│
├── n8n/                      # n8n workflow definitions
└── changes.md                # Project changelog
```

---

## Tech Stack

### Frontend
- **Framework:** React 18 + Vite
- **Language:** TypeScript
- **UI Library:** shadcn/ui
- **Styling:** Tailwind CSS with HSL design tokens
- **Typography:** Geist Sans (self-hosted variable font)
- **Data Tables:** TanStack React Table v8
- **Forms:** React Hook Form + Zod validation
- **Deployment:** Vercel

### Backend
- **Database:** PostgreSQL (Supabase)
- **Edge Functions:** Deno + TypeScript (Supabase Functions)
- **Authentication:** Supabase Auth (JWT)
- **Storage:** Supabase Storage (PUBLIC documents bucket)
- **Security:** Row Level Security (RLS) policies

### External Services
- **OCR Processing:** AI extraction service
- **Workflow Automation:** n8n
- **Email Ingestion:** Custom domain routing

---

## System Architecture

### Data Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         UPLOAD PHASE                            │
├─────────────────────────────────────────────────────────────────┤
│  Dashboard/Email/API → Storage Bucket → files (status: uploaded)│
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     CLASSIFICATION PHASE                         │
├─────────────────────────────────────────────────────────────────┤
│  Classifier Webhook → { bank_statement | application | other }  │
│  UPDATE files SET classification_type, status = 'classified'    │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                      EXTRACTION PHASE                            │
├─────────────────────────────────────────────────────────────────┤
│  Bank Statement → bank_statements + transactions + accounts     │
│  Application    → applications (company + owner data)           │
└─────────────────────────────────────────────────────────────────┘
                                │
                                ▼
┌─────────────────────────────────────────────────────────────────┐
│                     POST-PROCESSING                              │
├─────────────────────────────────────────────────────────────────┤
│  1. UPDATE files SET status = 'processed'                       │
│  2. Trigger: submissions.files_processed++                      │
│  3. Categorize transactions (40 categories)                     │
│  4. Compute submission_metrics aggregations                     │
└─────────────────────────────────────────────────────────────────┘
```

### Database Schema

```
organizations (multi-tenant root)
  ├─ profiles (users)
  ├─ api_keys (API authentication)
  └─ submissions (upload batches)
       ├─ files (uploaded documents with classification & extraction status)
       ├─ accounts (bank accounts derived from statements)
       │    └─ bank_statements (monthly statement summaries)
       │         └─ transactions (individual line items + categorization)
       ├─ applications (extracted loan application data)
       └─ submission_metrics (precomputed aggregations)

Reference Tables:
  - categories (40 transaction categories - Heron Data taxonomy)
```

### Key Tables

| Table | Purpose |
|-------|---------|
| `files` | Document tracking with classification & extraction workflow fields |
| `accounts` | Bank accounts derived from statement extraction |
| `bank_statements` | Monthly statement summaries (matches bank_schema_final.json) |
| `transactions` | Individual transactions with categorization enrichment |
| `applications` | Extracted loan application data (matches application_schema_final.json) |
| `categories` | 40 transaction categories for P&L reconstruction |
| `submission_metrics` | Precomputed aggregations for fast dashboard loading |

---

## Environment Variables

### Frontend (`.env` in `clearscrub_dashboard/`)
```env
VITE_SUPABASE_URL=https://vnhauomvzjucxadrbywg.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
```

### Backend
- **Project ID:** `vnhauomvzjucxadrbywg`
- **Storage Bucket:** `documents` (PUBLIC, 50MB limit)

---

## Key Features

### Completed
- Full UI with shadcn/ui components
- Production authentication (signup, login, RLS, protected routes)
- Auto-generated API keys for new organizations
- Document upload and tracking
- Bank statement extraction with transaction categorization
- Application data extraction
- 40 transaction categories (revenue, cogs, opex, debt, equity, intra_company, tax, special_items)
- Precomputed submission metrics

### In Progress
- Email ingestion (`{org_id}@underwrite.cleardata.io`)
- Webhook callback handlers for extraction results
- Transaction categorization automation

---

## Testing

**Production URLs:**
- **Dashboard:** https://dashboard.clearscrub.io
- **Edge Functions:** https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/

---

## Documentation

Technical documentation:
- `migration/schema_reference.md` - Complete data architecture & JSON-to-DB mappings
- `migration/callback_processing.md` - Webhook handler SQL operations
- `migration/clearscrub_migration.sql` - Full database migration script
- `changes.md` - Project changelog

---

## Security

- **Row Level Security (RLS):** All tables enforce multi-tenant isolation via `org_id`
- **JWT Authentication:** Supabase Auth tokens required for all API calls
- **Service Role Bypass:** Edge functions use service role for database writes
- **14 RLS Policies:** Org-scoped user access + service role bypass

---

## Contributing

This is a private project. For questions or access requests, contact the repository owner.

---

## License

Proprietary - All rights reserved

---

## Common Issues

### Frontend won't connect
- Check `.env` file in `clearscrub_dashboard/`
- Verify Supabase URL and anon key are correct

### Edge Function deployment fails
- Ensure you're in the `supabase/` directory
- Verify project ref is correct: `vnhauomvzjucxadrbywg`

### Files not processing
- Check `files.status` column for current state
- Verify webhook callbacks are configured
- Check Edge Function logs: `supabase functions logs <function-name>`

---

## Support

For technical support or questions:
- `migration/schema_reference.md` - Data architecture reference
- `changes.md` - Recent changes and pending tasks
- Supabase Dashboard: https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg

---

**Last updated:** 2025-12-22

**Built with care for modern lending operations**
