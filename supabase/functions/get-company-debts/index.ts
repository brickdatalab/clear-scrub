import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DebtRecord {
  id: string;
  company_id: string;
  creditor_name: string;
  debt_type: string;
  original_amount: number;
  current_balance: number;
  monthly_payment: number;
  interest_rate: number | null;
  start_date: string | null;
  status: string;
  created_at: string;
  monthly_summaries: DebtMonthlySummary[];
}

interface DebtMonthlySummary {
  month_start: string;
  month_label: string;
  payment_amount: number;
  principal_paid: number;
  interest_paid: number;
  ending_balance: number;
  is_delinquent: boolean;
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
    const companyId = pathParts[pathParts.length - 2]; // /companies/:id/debts

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

    // First, verify company exists and user has access (RLS will handle this)
    const { data: company, error: companyError } = await supabase
      .from('companies')
      .select('id')
      .eq('id', companyId)
      .single();

    if (companyError || !company) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'company_not_found',
            message: 'Company not found or access denied',
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

    // Query statements and analyze transactions for debt patterns
    // This is a simplified version - in production, you'd have a dedicated debts table
    const { data: statements, error: statementsError } = await supabase
      .from('statements')
      .select('id, raw_transactions, statement_period_start')
      .eq('company_id', companyId)
      .order('statement_period_start', { ascending: true });

    if (statementsError) {
      throw statementsError;
    }

    // Analyze transactions to identify debt payments
    const debtPatterns = new Map<string, any>();

    (statements || []).forEach((statement: any) => {
      const transactions = statement.raw_transactions || [];

      transactions.forEach((tx: any) => {
        // Look for recurring debt-related patterns
        const description = (tx.description || '').toLowerCase();

        // Common debt payment keywords
        const debtKeywords = ['loan', 'payment', 'credit', 'financing', 'debt', 'mortgage', 'lease'];
        const isDebtPayment = debtKeywords.some(keyword => description.includes(keyword));

        if (isDebtPayment && tx.amount < 0) { // Negative = outgoing payment
          const creditorKey = tx.description.substring(0, 30); // Use first 30 chars as key

          if (!debtPatterns.has(creditorKey)) {
            debtPatterns.set(creditorKey, {
              creditor_name: tx.description,
              payments: [],
              total_paid: 0,
            });
          }

          const debt = debtPatterns.get(creditorKey);
          debt.payments.push({
            date: statement.statement_period_start,
            amount: Math.abs(tx.amount),
          });
          debt.total_paid += Math.abs(tx.amount);
        }
      });
    });

    // Convert patterns to debt records
    const debts: any[] = [];
    let debtIndex = 0;

    debtPatterns.forEach((value, key) => {
      // Only include if we have multiple payments (recurring pattern)
      if (value.payments.length >= 2) {
        // Calculate average monthly payment
        const avgPayment = value.total_paid / value.payments.length;

        // Estimate current balance (simplified)
        const estimatedBalance = avgPayment * 12; // Assume ~12 months remaining

        // Build monthly summaries
        const monthlySummaries = value.payments.map((payment: any) => {
          const date = new Date(payment.date);
          const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

          return {
            month_start: payment.date,
            month_label: `${monthNames[date.getMonth()]} ${date.getFullYear()}`,
            payment_amount: payment.amount,
            principal_paid: payment.amount * 0.8, // Simplified
            interest_paid: payment.amount * 0.2,  // Simplified
            ending_balance: estimatedBalance - (payment.amount * 0.8),
            is_delinquent: false,
          };
        });

        debts.push({
          id: `debt_${debtIndex++}`,
          company_id: companyId,
          creditor_name: value.creditor_name,
          debt_type: 'recurring_payment',
          original_amount: estimatedBalance * 1.5, // Simplified estimate
          current_balance: estimatedBalance,
          monthly_payment: avgPayment,
          interest_rate: 0.06, // Estimated 6% APR
          start_date: value.payments[0]?.date || null,
          status: 'active',
          created_at: new Date().toISOString(),
          monthly_summaries: monthlySummaries,
        });
      }
    });

    return new Response(
      JSON.stringify({
        company_id: companyId,
        debts,
        summary: {
          total_debts: debts.length,
          total_current_balance: debts.reduce((sum, d) => sum + d.current_balance, 0),
          total_monthly_payment: debts.reduce((sum, d) => sum + d.monthly_payment, 0),
        },
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
    console.error('get-company-debts error:', error);

    return new Response(
      JSON.stringify({
        error: {
          code: 'fetch_debts_failed',
          message: error.message || 'Failed to fetch company debts',
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
