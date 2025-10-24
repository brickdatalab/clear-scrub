import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const WEBHOOK_SECRET = "clearscrub_webhook_2025_xyz123";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

interface WebhookPayload {
  document_id: string;
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
        amount: number;
        description: string;
        date: string;
        balance: number;
      }>;
    };
  };
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

  console.log(`Looking for company: "${companyName}" (normalized: "${normalizedName}", EIN: ${ein || 'N/A'})`);

  // STEP 1: Try EIN match (if EIN provided)
  if (ein) {
    const { data: einMatch, error: einError } = await supabase
      .from('companies')
      .select('id')
      .eq('org_id', orgId)
      .eq('ein', ein)
      .single();

    if (einMatch && !einError) {
      console.log(`Found existing company by EIN: ${einMatch.id}`);
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
    console.log(`Found existing company by normalized name: ${nameMatch.id}`);
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
    console.log(`Found company via alias: ${aliasMatch.company_id}`);
    return aliasMatch.company_id;
  }

  // STEP 4: Create new company
  console.log(`Creating new company: "${companyName}"${ein ? ` with EIN: ${ein}` : ''}`);

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
    console.error('Failed to create company:', createError);
    throw new Error(`Failed to create company: ${createError.message}`);
  }

  console.log(`Created new company: ${newCompany.id}`);
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

  console.log(`Looking for account: "${accountNumber}" (hash: ${accountHash.slice(0, 16)}...)`);

  // Try to find existing account by hash
  let { data: existing, error: findError } = await supabase
    .from('accounts')
    .select('id')
    .eq('company_id', companyId)
    .eq('account_number_hash', accountHash)
    .single();

  if (existing && !findError) {
    console.log(`Found existing account: ${existing.id}`);
    return existing.id;
  }

  // Create new account
  console.log(`Creating new account for company ${companyId}`);
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
    console.error('Failed to create account:', createError);
    throw new Error(`Failed to create account: ${createError.message}`);
  }

  console.log(`Created new account: ${newAccount.id}`);
  return newAccount.id;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify webhook secret
    const webhookSecret = req.headers.get("x-webhook-secret");
    if (!webhookSecret || webhookSecret !== WEBHOOK_SECRET) {
      return new Response(
        JSON.stringify({ error: "Unauthorized - invalid or missing webhook secret" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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

    // Parse JSON body
    let payload: WebhookPayload;
    try {
      payload = await req.json();
    } catch (error) {
      return new Response(
        JSON.stringify({ error: "Invalid JSON payload" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate required fields
    if (!payload.document_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: document_id" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (!payload.extracted_data) {
      return new Response(
        JSON.stringify({ error: "Missing required field: extracted_data" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // FIX #6: Use Service Role Key (NOT Anon Key)
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { persistSession: false }
    });

    console.log(`Processing document: ${payload.document_id}`);

    // STEP 1: Lookup org_id from document_id
    // First get the document to retrieve submission_id
    const { data: documentData, error: docError } = await supabaseAdmin
      .from('documents')
      .select('id, file_path, submission_id')
      .eq('id', payload.document_id)
      .single();

    if (docError || !documentData) {
      console.error('Document not found:', docError);
      return new Response(
        JSON.stringify({
          error: "Document not found",
          details: docError?.message || `No document found with id: ${payload.document_id}`
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // STEP 2: Get org_id from submission
    const { data: submissionData, error: subError } = await supabaseAdmin
      .from('submissions')
      .select('org_id')
      .eq('id', documentData.submission_id)
      .single();

    if (subError || !submissionData?.org_id) {
      console.error('Submission/Organization not found:', subError);
      return new Response(
        JSON.stringify({
          error: "Organization not found for document",
          details: subError?.message || `No submission found with id: ${documentData.submission_id}`
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const orgId = submissionData.org_id;
    console.log(`Document belongs to org_id: ${orgId}`);

    // FIX #14: File Deduplication Check
    // Create a hash from the structured JSON to detect duplicate processing
    const dataHash = await computeSHA256(JSON.stringify(payload.extracted_data));

    // Check if we've already processed a document with this exact data
    const { data: existingDoc, error: dupError } = await supabaseAdmin
      .from('documents')
      .select('id, submission_id')
      .eq('submission_id', documentData.submission_id)
      .eq('structured_json', payload.extracted_data)
      .neq('id', payload.document_id)
      .limit(1);

    if (existingDoc && existingDoc.length > 0) {
      console.log(`Duplicate document detected. Existing doc: ${existingDoc[0].id}`);
      // Still update this document's status but don't create duplicate statements
      await supabaseAdmin
        .from('documents')
        .update({
          structured_json: payload.extracted_data,
          status: 'completed',
          structured_at: new Date().toISOString(),
          processing_completed_at: new Date().toISOString(),
        })
        .eq('id', payload.document_id);

      return new Response(
        JSON.stringify({
          success: true,
          document_id: payload.document_id,
          status: 'duplicate',
          message: 'Document data already processed',
          existing_document_id: existingDoc[0].id,
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Extract statement data
    const statement = payload.extracted_data.statement;
    const summary = statement.summary;
    const rawTransactions = statement.transactions;

    // FIX #2 & #3: Add transaction IDs and types
    const transactions = rawTransactions.map((tx, index) => ({
      ...tx,
      id: `${payload.document_id}-${index.toString().padStart(4, '0')}`,
      type: classifyTransaction(tx)
    }));

    // FIX #8: Calculate deposit_count
    const depositCount = transactions.filter(tx => tx.amount > 0).length;

    // Calculate NSF count
    const nsfCount = transactions.filter(tx =>
      /NSF|INSUFFICIENT|OVERDRAFT/i.test(tx.description)
    ).length;

    // Calculate negative balance days
    const negativeBalanceDays = transactions.filter(tx => tx.balance < 0).length;

    // Calculate true_revenue (sum of deposits)
    const trueRevenue = transactions
      .filter(tx => tx.amount > 0)
      .reduce((sum, tx) => sum + tx.amount, 0);

    console.log(`Calculated metrics: deposits=${depositCount}, nsf=${nsfCount}, negative_days=${negativeBalanceDays}`);

    // Extract EIN if present (bank statements may not have it, but check anyway)
    const ein = (summary as any).ein || undefined;

    // Entity Resolution: Company (using unified strategy)
    const companyId = await findOrCreateCompanyUnified(
      supabaseAdmin,
      orgId,
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

    // Check for existing statement (idempotency)
    const { data: existingStatement } = await supabaseAdmin
      .from('statements')
      .select('id')
      .eq('account_id', accountId)
      .eq('statement_period_start', summary.statement_start_date)
      .eq('statement_period_end', summary.statement_end_date)
      .single();

    let statementId: string;

    if (existingStatement) {
      console.log(`Updating existing statement: ${existingStatement.id}`);
      statementId = existingStatement.id;

      // Update existing statement
      const { error: updateError } = await supabaseAdmin
        .from('statements')
        .update({
          document_id: payload.document_id,
          company_id: companyId,
          statement_date: summary.statement_end_date,
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
          raw_transactions: transactions,
          submission_id: documentData.submission_id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingStatement.id);

      if (updateError) {
        console.error('Failed to update statement:', updateError);
        throw new Error(`Failed to update statement: ${updateError.message}`);
      }
    } else {
      console.log('Creating new statement');

      // Insert new statement
      const { data: newStatement, error: insertError } = await supabaseAdmin
        .from('statements')
        .insert({
          document_id: payload.document_id,
          account_id: accountId,
          company_id: companyId,
          statement_period_start: summary.statement_start_date,
          statement_period_end: summary.statement_end_date,
          statement_date: summary.statement_end_date,
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
          raw_transactions: transactions,
          submission_id: documentData.submission_id,
        })
        .select('id')
        .single();

      if (insertError) {
        console.error('Failed to insert statement:', insertError);
        throw new Error(`Failed to insert statement: ${insertError.message}`);
      }

      statementId = newStatement.id;
      console.log(`Created statement: ${statementId}`);
    }

    // Update document status
    const { error: docUpdateError } = await supabaseAdmin
      .from('documents')
      .update({
        structured_json: payload.extracted_data,
        status: 'completed',
        structured_at: new Date().toISOString(),
        processing_completed_at: new Date().toISOString(),
        company_id: companyId,
      })
      .eq('id', payload.document_id);

    if (docUpdateError) {
      console.error('Failed to update document:', docUpdateError);
      // Don't fail the whole operation for this
    }

    // FIX #1: Refresh Materialized Views via RPC
    console.log('Refreshing materialized views...');
    try {
      await supabaseAdmin.rpc('refresh_account_rollups_concurrent');
      await supabaseAdmin.rpc('refresh_company_rollups_concurrent');
      console.log('Materialized views refreshed successfully');
    } catch (error) {
      console.error('MV refresh failed (non-blocking):', error);
      // Log but don't block - MVs will refresh on schedule
    }

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
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
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
