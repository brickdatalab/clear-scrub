import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

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

    // Parse request body
    let body;
    try {
      body = await req.json();
    } catch {
      return new Response(
        JSON.stringify({
          error: {
            code: 'invalid_json',
            message: 'Request body must be valid JSON',
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

    const { statement_id } = body;

    if (!statement_id) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'missing_statement_id',
            message: 'statement_id is required in request body',
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

    // Query statement with raw_transactions (FIX #9: Lazy load transactions)
    const { data: statement, error } = await supabase
      .from('statements')
      .select('id, raw_transactions')
      .eq('id', statement_id)
      .single();

    if (error || !statement) {
      return new Response(
        JSON.stringify({
          error: {
            code: 'statement_not_found',
            message: 'Statement not found or access denied',
            details: { statement_id },
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

    return new Response(
      JSON.stringify({
        statement_id: statement.id,
        transactions: statement.raw_transactions || [],
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
    console.error('get-statement-transactions error:', error);

    return new Response(
      JSON.stringify({
        error: {
          code: 'fetch_transactions_failed',
          message: error.message || 'Failed to fetch statement transactions',
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
