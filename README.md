# ClearScrub

**Bank Statement Underwriting Platform for Lenders**

ClearScrub is a production-ready SaaS platform that automates bank statement analysis and loan application processing. The system ingests documents via API/dashboard/email, extracts structured data using Mistral OCR, and provides financial analytics through a React dashboard.

---

## 🚀 Quick Start

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

**Database (Migrations):**
```bash
cd supabase/database
supabase db push --project-ref vnhauomvzjucxadrbywg
```

---

## 📁 Project Structure

```
clearscrub/
├── clearscrub_dashboard/     # React frontend (Vite + TypeScript)
│   ├── src/
│   │   ├── components/       # React components (shadcn/ui)
│   │   ├── pages/           # Route pages
│   │   ├── services/        # API service layer
│   │   ├── hooks/           # Custom React hooks
│   │   ├── lib/             # Utilities (Supabase client, etc.)
│   │   └── types/           # TypeScript interfaces
│   ├── public/              # Static assets (fonts, logos)
│   └── .vercel/             # Vercel deployment config
│
├── supabase/                # Backend infrastructure
│   ├── functions/           # Edge Functions (Deno)
│   │   ├── application-schema-intake/
│   │   ├── statement-schema-intake/
│   │   ├── list-companies/
│   │   ├── get-company-detail/
│   │   ├── get-statement-transactions/
│   │   ├── get-company-debts/
│   │   ├── upload-documents/
│   │   ├── enqueue-document-processing/
│   │   └── check-trigger-status/
│   └── database/
│       ├── migrations/      # Versioned SQL migrations
│       └── schemas/         # Database schema definitions
│
├── docs/                    # Architecture documentation
│   ├── ADRs/               # Architecture Decision Records
│   ├── API_CONTRACTS.md    # API endpoint specifications
│   ├── AUTHENTICATION_FLOWS.md
│   ├── RLS_POLICY_REFERENCE.md
│   └── ORG_ID_ASSIGNMENT.md
│
├── n8n/                    # n8n workflow definitions
└── CLAUDE.md               # AI assistant project instructions
```

---

## 🛠 Tech Stack

### Frontend
- **Framework:** React 18 + Vite
- **Language:** TypeScript
- **UI Library:** shadcn/ui (27 components)
- **Styling:** Tailwind CSS with HSL design tokens
- **Typography:** Geist Sans (self-hosted variable font)
- **Data Tables:** TanStack React Table v8
- **Forms:** React Hook Form + Zod validation
- **State Management:** React Context API + TanStack Query
- **Deployment:** Vercel

### Backend
- **Database:** PostgreSQL (Supabase)
- **Edge Functions:** Deno + TypeScript (Supabase Functions)
- **Authentication:** Supabase Auth (JWT)
- **Storage:** Supabase Storage
- **Security:** Row Level Security (RLS) policies

### External Services
- **OCR Processing:** Mistral AI + LlamaIndex
- **Workflow Automation:** n8n
- **Email Ingestion:** Custom domain routing

---

## 🏗 System Architecture

### Data Flow

```
PDF Upload → Supabase Storage (incoming-documents bucket)
     ↓
Mistral OCR Extraction → Structured JSON
     ↓
Edge Function Intake (statement-schema-intake / application-schema-intake)
     ↓
Entity Resolution (4-step: EIN → name → alias → create)
     ↓
PostgreSQL Tables (companies → accounts → statements → transactions)
     ↓
Materialized View Refresh (account_monthly_rollups, company_rollups)
     ↓
Dashboard API Endpoints
     ↓
React Dashboard Display
```

### Database Schema

```
organizations (multi-tenant root)
  ├─ profiles (users)
  ├─ api_keys (API authentication)
  └─ companies (applicants)
       ├─ applications (loan requests)
       ├─ accounts (bank accounts)
       │    └─ statements (monthly periods)
       │         └─ transactions (individual line items)
       ├─ submissions (upload batches)
       │    └─ documents (individual files)
       └─ company_aliases (manual name variations)

Materialized Views:
  - account_monthly_rollups (pre-calculated monthly aggregates)
  - company_rollups (company-level metrics)
```

### Key Architectural Decisions

1. **Unified Entity Resolution:** 4-step matching process (EIN → normalized name → alias → create) prevents duplicate companies
2. **Lazy-Loading Transactions:** Main API excludes transactions to keep payloads <50KB; fetched on-demand
3. **Materialized View Refresh via RPC:** Edge Functions call `REFRESH CONCURRENTLY` after data ingestion
4. **Field Name Mapping:** Edge Functions map database `snake_case` to frontend `camelCase`
5. **Three Authentication Contexts:**
   - Webhook intake: Shared secret (`X-Webhook-Secret`)
   - Database writes: Service Role Key (bypasses RLS)
   - Read APIs: User JWT (enforces RLS)

---

## 🔑 Environment Variables

### Frontend (`.env` in `clearscrub_dashboard/`)
```env
VITE_SUPABASE_URL=https://vnhauomvzjucxadrbywg.supabase.co
VITE_SUPABASE_ANON_KEY=<your_anon_key>
```

### Backend
- **Project ID:** `vnhauomvzjucxadrbywg`
- **Webhook Secret:** `clearscrub_webhook_2025_xyz123`

---

## 📊 Key Features

### Completed Features ✅
- **Full UI Migration to shadcn/ui:** 86% bundle size reduction, WCAG 2.1 AA accessibility compliance
- **Complete API Service Layer:** 20+ CRUD functions for API Keys, Webhooks, Notifications, Automation Triggers
- **Production Authentication:** Signup, login, RLS on all tables, protected routes, session management
- **Auto-Generated API Keys:** New organizations automatically receive default API key (`cs_live_*`)
- **Entity Resolution:** Intelligent company matching prevents duplicates
- **Lazy-Loading:** Optimized data fetching for large transaction datasets

### In Progress 🚧
- Manual document upload (dashboard drag-and-drop)
- Email ingestion (`{org_id}@underwrite.cleardata.io`)
- Settings page API integration

---

## 🧪 Testing

**Note:** This project follows a production-only workflow. Changes are deployed directly to production without local testing.

**Production URLs:**
- **Dashboard:** https://dashboard.clearscrub.io
- **Edge Functions:** https://vnhauomvzjucxadrbywg.supabase.co/functions/v1/

---

## 📚 Documentation

All technical documentation is in the `/docs/` directory:

- **Architecture Decision Records (ADRs):** Why key architectural choices were made
- **API Contracts:** Endpoint specifications and data schemas
- **Authentication Flows:** How user auth and RLS work
- **RLS Policy Reference:** Database security policies

For AI assistant instructions, see `CLAUDE.md` in the root directory.

---

## 🔒 Security

- **Row Level Security (RLS):** All tables enforce multi-tenant isolation via `org_id`
- **JWT Authentication:** Supabase Auth tokens required for all API calls
- **API Key Hashing:** SHA-256 hashed keys stored in database
- **Webhook Signing:** Shared secret validation for intake endpoints

---

## 🤝 Contributing

This is a private project. For questions or access requests, contact the repository owner.

---

## 📝 License

Proprietary - All rights reserved

---

## 🆘 Common Issues

### Frontend won't connect
- Check `.env` file in `clearscrub_dashboard/`
- Verify Supabase URL and anon key are correct

### Edge Function deployment fails
- Ensure you're in the `supabase/` directory
- Verify project ref is correct: `vnhauomvzjucxadrbywg`

### Duplicate companies appearing
- Check entity resolution logic in intake webhooks
- Verify `normalized_legal_name` and `account_number_hash` are computed correctly

### Transactions not loading
- Check browser console for API errors
- Verify JWT is present in request headers
- Use `supabase functions logs <function-name>` to debug

---

## 📞 Support

For technical support or questions about this boilerplate, please refer to:
- `CLAUDE.md` - Comprehensive project instructions
- `/docs/` - Architecture and API documentation
- Supabase Dashboard: https://supabase.com/dashboard/project/vnhauomvzjucxadrbywg

---

**Built with care for modern lending operations**
