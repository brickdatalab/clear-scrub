import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const WEBHOOK_SECRET = "clearscrub_webhook_2025_xyz123";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret, x-clearscrub-timestamp",
};

interface WebhookPayload {
  document_id: string;
  submission_id: string;
  org_id: string;
  file_path: string;
  llama_job_id: string;
  partial_success?: boolean;
  extraction_errors?: string[];
  extracted_data: {
    statement: {
      summary: {
        account_number: string;
        bank_name: string;
        company: string;
        start_balance: number;
        end_balance: number;
        statement_start_date: string;
        statement_end_date: string;
        total_credits: number;
        total_debits: number;
        num_credits: number;
        num_debits: number;
        num_transactions: number;
      };
      transactions: Array<{
        amount: number | string;
        description: string;
        date: string;
        balance: number;
      }>;
    };
  };
}

// NEW: Structured JSON Logging Function
function structuredLog(event: string, data: any) {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    event,
    level: data.error ? 'error' : 'info',
    ...data
  }));
}

// FIX #10: Normalization Functions
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(INC|LLC|CORP|CO|LTD|CORPORATION|L\.L\.C|PLLC)\b/g, '')
    .trim();
}

function normalizeAccountNumber(account: string): string {
  return account.replace(/[^0-9]/g, ''); // digits only
}

// FIX #2 & #3: Transaction Classification
function classifyTransaction(tx: any): 'deposit' | 'withdrawal' | 'fee' {
  if (tx.amount > 0) return 'deposit';
  if (tx.amount < 0) {
    if (/NSF|FEE|OVERDRAFT|SERVICE|CHARGE/i.test(tx.description)) {
      return 'fee';
    }
    return 'withdrawal';
  }
  return 'deposit';
}

// FIX #14: SHA-256 Hash for File Deduplication
async function computeSHA256(text: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(text);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  return hashHex;
}

// Entity Resolution: Find or Create Company (Unified Strategy)
// Implements 4-step matching: EIN → normalized_legal_name → company_aliases → create new
async function findOrCreateCompanyUnified(
  supabase: any,
  orgId: string,
  companyName: string,
  ein?: string
): Promise<string> {
  const normalizedName = normalizeCompanyName(companyName);

  structuredLog('entity_resolution_start', {
    company_name: companyName,
    normalized_name: normalizedName,
    ein: ein || 'N/A',
    org_id: orgId
  });

  // STEP 1: Try EIN match (if EIN provided)
  if (ein) {
    const { data: einMatch, error: einError } = await supabase
      .from('companies')
      .select('id')
      .eq('org_id', orgId)
      .eq('ein', ein)
      .single();

    if (einMatch && !einError) {
      structuredLog('entity_resolution_success', {
        match_type: 'ein',
        company_id: einMatch.id,
        ein
      });
      return einMatch.id;
    }
  }

  // STEP 2: Try exact match on normalized_legal_name
  const { data: nameMatch, error: nameError } = await supabase
    .from('companies')
    .select('id')
    .eq('org_id', orgId)
    .eq('normalized_legal_name', normalizedName)
    .single();

  if (nameMatch && !nameError) {
    structuredLog('entity_resolution_success', {
      match_type: 'normalized_name',
      company_id: nameMatch.id,
      normalized_name: normalizedName
    });
    return nameMatch.id;
  }

  // STEP 3: Try company_aliases table
  const { data: aliasMatch, error: aliasError } = await supabase
    .from('company_aliases')
    .select('company_id')
    .eq('org_id', orgId)
    .eq('normalized_alias_name', normalizedName)
    .single();

  if (aliasMatch && !aliasError) {
    structuredLog('entity_resolution_success', {
      match_type: 'alias',
      company_id: aliasMatch.company_id,
      normalized_name: normalizedName
    });
    return aliasMatch.company_id;
  }

  // STEP 4: Create new company
  structuredLog('entity_resolution_create', {
    company_name: companyName,
    normalized_name: normalizedName,
    ein: ein || 'N/A'
  });

  const insertData: any = {
    org_id: orgId,
    legal_name: companyName,
    normalized_legal_name: normalizedName,
  };

  // Include EIN if provided
  if (ein) {
    insertData.ein = ein;
  }

  const { data: newCompany, error: createError } = await supabase
    .from('companies')
    .insert(insertData)
    .select('id')
    .single();

  if (createError) {
    structuredLog('entity_resolution_failed', {
      error: createError.message,
      company_name: companyName
    });
    throw new Error(`Failed to create company: ${createError.message}`);
  }

  structuredLog('entity_resolution_success', {
    match_type: 'created',
    company_id: newCompany.id
  });
  return newCompany.id;
}

// Entity Resolution: Find or Create Account
async function findOrCreateAccount(
  supabase: any,
  accountNumber: string,
  bankName: string,
  companyId: string
): Promise<string> {
  const normalizedAccount = normalizeAccountNumber(accountNumber);
  const accountHash = await computeSHA256(normalizedAccount);
  const last4 = normalizedAccount.slice(-4);
  const maskedAccount = `****${last4}`;

  structuredLog('account_resolution_start', {
    account_number_masked: maskedAccount,
    bank_name: bankName,
    company_id: companyId
  });

  // Try to find existing account by hash
  let { data: existing, error: findError } = await supabase
    .from('accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_number_hash', accountHash)
    .single();

  if (existing && !findError) {
    structuredLog('account_resolution_success', {
      match_type: 'existing',
      account_id: existing.id
    });
    return existing.id;
  }

  // Create new account
  const { data: newAccount, error: createError } = await supabase
    .from('accounts')
    .insert({
      company_id: companyId,
      bank_name: bankName,
      account_number_masked: maskedAccount,
      account_number_hash: accountHash,
      account_type: 'checking', // Default
      status: 'active',
    })
    .select('id')
    .single();

  if (createError) {
    structuredLog('account_resolution_failed', {
      error: createError.message,
      account_number_masked: maskedAccount
    });
    throw new Error(`Failed to create account: ${createError.message}`);
  }

  structuredLog('account_resolution_success', {
    match_type: 'created',
    account_id: newAccount.id
  });
  return newAccount.id;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const headers = req.headers;

    // NEW #1: Validate X-Webhook-Secret header
    const webhookSecret = headers.get('x-webhook-secret');
    if (!webhookSecret || webhookSecret !== WEBHOOK_SECRET) {
      structuredLog('invalid_secret', {
        error: 'Invalid or missing webhook secret'
      });
      return new Response(
        JSON.stringify({
          meta: { error_code: 'invalid_secret', status: 'error' },
          message: 'Invalid or missing webhook secret'
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEW #1: Validate x-clearscrub-timestamp (reject >5 min skew)
    const timestamp = headers.get('x-clearscrub-timestamp');
    if (!timestamp) {
      structuredLog('missing_timestamp', {
        error: 'Missing x-clearscrub-timestamp header'
      });
      return new Response(
        JSON.stringify({
          meta: { error_code: 'missing_timestamp', status: 'error' },
          message: 'Missing x-clearscrub-timestamp header'
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const requestTime = parseInt(timestamp);
    const currentTime = Date.now();
    const skewMs = Math.abs(currentTime - requestTime);
    if (skewMs > 5 * 60 * 1000) { // 5 minutes
      structuredLog('replay_window_exceeded', {
        error: `Request timestamp outside 5-minute window (skew: ${skewMs}ms)`,
        request_time: requestTime,
        current_time: currentTime,
        skew_ms: skewMs
      });
      return new Response(
        JSON.stringify({
          meta: { error_code: 'replay_window_exceeded', status: 'error' },
          message: `Request timestamp outside 5-minute window (skew: ${skewMs}ms)`
        }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only accept POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ error: "Method not allowed" }),
        {
          status: 405,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // NEW #2: Validate payload size (max 8MB)
    const contentLength = headers.get('content-length');
    if (contentLength && parseInt(contentLength) > 8 * 1024 * 1024) {
      structuredLog('payload_too_large', {
        error: 'Payload exceeds 8MB limit',
        content_length: parseInt(contentLength)
      });
      return new Response(
        JSON.stringify({
          meta: { error_code: 'payload_too_large', status: 'error' },
          message: 'Payload exceeds 8MB limit'
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEW #2: Parse request body
    let payload: WebhookPayload;
    try {
      const body = await req.text();
      payload = JSON.parse(body);
    } catch (e) {
      structuredLog('invalid_json', {
        error: 'Request body is not valid JSON',
        parse_error: e.message
      });
      return new Response(
        JSON.stringify({
          meta: { error_code: 'invalid_json', status: 'error' },
          message: 'Request body is not valid JSON'
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // NEW #2: Validate required fields
    const requiredFields = ['document_id', 'submission_id', 'org_id', 'file_path', 'llama_job_id', 'extracted_data'];
    for (const field of requiredFields) {
      if (!(payload as any)[field]) {
        structuredLog('missing_field', {
          error: `Missing required field: ${field}`,
          payload_keys: Object.keys(payload)
        });
        return new Response(
          JSON.stringify({
            meta: { error_code: 'missing_field', status: 'error' },
            message: `Missing required field: ${field}`
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // NEW #2: Validate transactions count (max 10,000 per statement)
    const transactions = payload.extracted_data?.statement?.transactions || [];
    if (transactions.length > 10000) {
      structuredLog('too_many_transactions', {
        error: `Statement has ${transactions.length} transactions, max 10,000`,
        transaction_count: transactions.length
      });
      return new Response(
        JSON.stringify({
          meta: { error_code: 'too_many_transactions', status: 'error' },
          message: `Statement has ${transactions.length} transactions, max 10,000`
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FIX #6: Use Service Role Key (NOT Anon Key)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    structuredLog('processing_start', {
      document_id: payload.document_id,
      org_id: payload.org_id,
      llama_job_id: payload.llama_job_id
    });

    // NEW #3: Run-Level Idempotency Check
    const { data: existingDoc, error: existingDocError } = await supabaseAdmin
      .from('documents')
      .select('id, schema_job_id')
      .eq('id', payload.document_id)
      .eq('org_id', payload.org_id)
      .single();

    if (existingDoc?.schema_job_id) {
      if (existingDoc.schema_job_id === payload.llama_job_id) {
        // Exact replay - return success silently
        structuredLog('idempotent_replay', {
          document_id: payload.document_id,
          llama_job_id: payload.llama_job_id,
          message: 'Exact replay detected - skipping reprocessing'
        });
        return new Response(
          JSON.stringify({
            meta: { status: 'success', idempotent_replay: true },
            document_id: payload.document_id,
            message: 'Already processed'
          }),
          { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      } else {
        // Different job_id for same document - CONFLICT
        structuredLog('document_conflict', {
          document_id: payload.document_id,
          previous_job_id: existingDoc.schema_job_id,
          current_job_id: payload.llama_job_id,
          error: 'Document already processed by different extraction job'
        });
        return new Response(
          JSON.stringify({
            meta: { error_code: 'statement_conflict', status: 'error' },
            message: 'Document already processed by different extraction job',
            existing_job_id: existingDoc.schema_job_id
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // NEW #8: Handle partial_success flag
    if (payload.partial_success) {
      structuredLog('partial_success', {
        document_id: payload.document_id,
        extraction_errors: payload.extraction_errors,
        warning: 'Extraction completed with errors - some data may be incomplete'
      });
    }

    // Extract statement data
    const statement = payload.extracted_data.statement;
    const summary = statement.summary;
    const rawTransactions = statement.transactions;

    // NEW #4: Amount Parsing (Handle string or number) + Date Validation
    const processedTransactions = [];
    for (let index = 0; index < rawTransactions.length; index++) {
      const tx = rawTransactions[index];

      // Parse amount
      const amount = typeof tx.amount === 'string'
        ? parseFloat(tx.amount)
        : tx.amount;

      if (isNaN(amount)) {
        structuredLog('invalid_amount', {
          raw_amount: tx.amount,
          transaction_date: tx.date,
          transaction_index: index,
          error: 'Cannot parse amount as number'
        });
        return new Response(
          JSON.stringify({
            meta: { error_code: 'invalid_amount', status: 'error' },
            message: `Invalid amount format at transaction ${index}: ${tx.amount}`
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Validate date
      const txDate = new Date(tx.date);
      if (isNaN(txDate.getTime())) {
        structuredLog('invalid_date', {
          raw_date: tx.date,
          transaction_index: index,
          error: 'Cannot parse date as valid ISO 8601'
        });
        return new Response(
          JSON.stringify({
            meta: { error_code: 'invalid_date', status: 'error' },
            message: `Invalid date format at transaction ${index}: ${tx.date}`
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      processedTransactions.push({
        ...tx,
        amount,
        id: `${payload.document_id}-${index.toString().padStart(4, '0')}`,
        type: classifyTransaction({ ...tx, amount })
      });
    }

    // FIX #8: Calculate deposit_count
    const depositCount = processedTransactions.filter(tx => tx.amount > 0).length;

    // Calculate NSF count
    const nsfCount = processedTransactions.filter(tx =>
      /NSF|INSUFFICIENT|OVERDRAFT/i.test(tx.description)
    ).length;

    // Calculate negative balance days
    const negativeBalanceDays = processedTransactions.filter(tx => tx.balance < 0).length;

    // Calculate true_revenue (sum of deposits)
    const trueRevenue = processedTransactions
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);

    structuredLog('metrics_calculated', {
      deposit_count: depositCount,
      nsf_count: nsfCount,
      negative_balance_days: negativeBalanceDays,
      true_revenue: trueRevenue
    });

    // Extract EIN if present (bank statements may not have it, but check anyway)
    const ein = (summary as any).ein || undefined;

    // Entity Resolution: Company (using unified strategy)
    const companyId = await findOrCreateCompanyUnified(
      supabaseAdmin,
      payload.org_id,
      summary.company,
      ein
    );

    // Entity Resolution: Account
    const accountId = await findOrCreateAccount(
      supabaseAdmin,
      summary.account_number,
      summary.bank_name,
      companyId
    );

    // NEW #7: Statement Upsert (Use Composite Key)
    const startDate = summary.statement_start_date;
    const endDate = summary.statement_end_date;

    // Check for existing statement (idempotency)
    const { data: existingStatement } = await supabaseAdmin
      .from('statements')
      .select('id')
      .eq('account_id', accountId)
      .eq('statement_period_start', startDate)
      .eq('statement_period_end', endDate)
      .single();

    let statementId: string;

    if (existingStatement) {
      structuredLog('statement_update', {
        statement_id: existingStatement.id,
        account_id: accountId,
        period: `${startDate} to ${endDate}`
      });
      statementId = existingStatement.id;

      // Update existing statement
      const { error: updateError } = await supabaseAdmin
        .from('statements')
        .update({
          document_id: payload.document_id,
          company_id: companyId,
          statement_date: endDate,
          opening_balance: summary.start_balance,
          closing_balance: summary.end_balance,
          total_deposits: summary.total_credits,
          total_withdrawals: summary.total_debits,
          deposit_count: depositCount,
          true_revenue: trueRevenue,
          true_revenue_count: depositCount,
          negative_balance_days: negativeBalanceDays,
          nsf_count: nsfCount,
          transaction_count: summary.num_transactions,
          raw_transactions: processedTransactions,
          submission_id: payload.submission_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingStatement.id);

      if (updateError) {
        structuredLog('statement_update_failed', {
          error: updateError.message,
          statement_id: existingStatement.id
        });
        throw new Error(`Failed to update statement: ${updateError.message}`);
      }
    } else {
      // Insert new statement
      const { data: newStatement, error: insertError } = await supabaseAdmin
        .from('statements')
        .insert({
          document_id: payload.document_id,
          account_id: accountId,
          company_id: companyId,
          statement_period_start: startDate,
          statement_period_end: endDate,
          statement_date: endDate,
          opening_balance: summary.start_balance,
          closing_balance: summary.end_balance,
          total_deposits: summary.total_credits,
          total_withdrawals: summary.total_debits,
          deposit_count: depositCount,
          true_revenue: trueRevenue,
          true_revenue_count: depositCount,
          negative_balance_days: negativeBalanceDays,
          nsf_count: nsfCount,
          transaction_count: summary.num_transactions,
          raw_transactions: processedTransactions,
          submission_id: payload.submission_id,
        })
        .select('id')
        .single();

      if (insertError) {
        structuredLog('statement_insert_failed', {
          error: insertError.message,
          account_id: accountId
        });
        throw new Error(`Failed to insert statement: ${insertError.message}`);
      }

      statementId = newStatement.id;
      structuredLog('statement_upsert_success', {
        statement_id: statementId,
        account_id: accountId,
        period: `${startDate} to ${endDate}`,
        transaction_count: processedTransactions.length
      });
    }

    // Update document status with schema_job_id
    const { error: docUpdateError } = await supabaseAdmin
      .from('documents')
      .update({
        structured_json: payload.extracted_data,
        schema_job_id: payload.llama_job_id,
        status: 'completed',
        structured_at: new Date().toISOString(),
        processing_completed_at: new Date().toISOString(),
        company_id: companyId,
      })
      .eq('id', payload.document_id);

    if (docUpdateError) {
      structuredLog('document_update_failed', {
        error: docUpdateError.message,
        document_id: payload.document_id
      });
      // Don't fail the whole operation for this
    }

    // FIX #1: Refresh Materialized Views via RPC
    structuredLog('materialized_view_refresh_start', {
      statement_id: statementId
    });
    try {
      await supabaseAdmin.rpc('refresh_account_rollups_concurrent');
      await supabaseAdmin.rpc('refresh_company_rollups_concurrent');
      structuredLog('materialized_view_refresh_success', {
        statement_id: statementId
      });
    } catch (error) {
      structuredLog('materialized_view_refresh_failed', {
        error: error.message,
        warning: 'Non-blocking - MVs will refresh on schedule'
      });
      // Log but don't block - MVs will refresh on schedule
    }

    // Return success response
    return new Response(
      JSON.stringify({
        meta: { status: 'success' },
        document_id: payload.document_id,
        statement_id: statementId,
        company_id: companyId,
        account_id: accountId,
        status: 'completed',
        metrics: {
          deposit_count: depositCount,
          nsf_count: nsfCount,
          negative_balance_days: negativeBalanceDays,
          true_revenue: trueRevenue,
        }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );

  } catch (error) {
    structuredLog('unexpected_error', {
      error: error.message,
      stack: error.stack
    });
    return new Response(
      JSON.stringify({
        meta: { error_code: 'internal_error', status: 'error' },
        message: "Internal server error",
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
