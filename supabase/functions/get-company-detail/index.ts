import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Format date to "Jun 2025"
function formatPeriod(monthStart: string): string {
  const date = new Date(monthStart);
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
}

Deno.serve(async (req: Request) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  try {
    // Create Supabase client with JWT auth (enables RLS)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! }
        }
      }
    );

    // Extract company ID from URL
    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const companyId = pathParts[pathParts.length - 1];

    if (!companyId) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'missing_company_id',
            message: 'Company ID is required',
            details: {},
          },
        }),
        {
          status: 400,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Query company data
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'company_not_found',
            message: 'Company not found',
            details: { company_id: companyId },
          },
        }),
        {
          status: 404,
          headers: {
            ...corsHeaders,
            'Content-Type': 'application/json',
          },
        }
      );
    }

    // Query account_monthly_rollups materialized view for Level 1 data
    const { data: rollups, error: rollupsError } = await supabase
      .from('account_monthly_rollups')
      .select('*')
      .eq('company_id', companyId)
      .order('month_start', { ascending: true });

    if (rollupsError) {
      throw rollupsError;
    }

    // Query accounts for Level 2 data
    const { data: accounts, error: accountsError } = await supabase
      .from('accounts')
      .select('id, bank_name, account_type, account_number_masked, is_primary, status')
      .eq('company_id', companyId);

    if (accountsError) {
      throw accountsError;
    }

    // Build account map for O(N) merging (FIX #13)
    const accountMap = new Map();
    (accounts || []).forEach((acc: any) => {
      accountMap.set(acc.id, {
        accountId: acc.id,
        bank: acc.bank_name,
        type: acc.account_type,
        masked: acc.account_number_masked,
        isPrimary: acc.is_primary,
        status: acc.status,
      });
    });

    // Transform monthly data with explicit field mapping (FIX #7)
    const monthlyData = (rollups || []).map((row: any) => ({
      // Period formatting
      period: formatPeriod(row.month_start),
      period_key: row.month_start,
      period_label: formatPeriod(row.month_start),

      // Financial metrics (snake_case → mixed case)
      avg_daily_balance: row.average_daily_balance,
      neg_ending_days: row.negative_balance_days,
      deposits: row.total_deposits,
      deposit_count: row.deposit_count || 0,  // New column from FIX #8
      withdrawals: row.total_withdrawals,
      nsf_count: row.nsf_count,
      true_revenue: row.true_revenue,

      // Account reference for Level 2 merge
      account_id: row.account_id,
    }));

    // Enrich monthly data with account details using HashMap
    const enrichedMonthlyData = monthlyData.map((month: any) => ({
      ...month,
      account: accountMap.get(month.account_id) || null,
    }));

    // Build accounts array for Level 2
    const accountsArray = Array.from(accountMap.values());

    // Return response with FIX #4: NULL for applications (not stubs)
    return new Response(
      JSON.stringify({
        company: {
          id: company.id,
          legal_name: company.legal_name,
          dba_name: company.dba_name,
          ein: company.ein,
          industry: company.industry,
          phone: company.phone,
          email: company.email,
          address_line1: company.address_line1,
          address_line2: company.address_line2,
          city: company.city,
          state: company.state,
          zip: company.zip,
          created_at: company.created_at,
          updated_at: company.updated_at,
        },
        monthly_data: enrichedMonthlyData,  // Level 1
        accounts: accountsArray,             // Level 2
        business: null,                      // FIX #4: NULL not stub
        funding: null,                       // FIX #4: NULL not stub
        owners: [],                          // FIX #4: Empty array
        files: [],                           // FIX #4: Empty array
      }),
      {
        status: 200,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  } catch (error) {
    console.error('get-company-detail error:', error);

    return new Response(
      JSON.stringify({
        error: {
          code: 'company_detail_failed',
          message: error.message || 'Failed to fetch company detail',
          details: {},
        },
      }),
      {
        status: 500,
        headers: {
          ...corsHeaders,
          'Content-Type': 'application/json',
        },
      }
    );
  }
});
