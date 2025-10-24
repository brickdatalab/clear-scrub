import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const WEBHOOK_SECRET = "clearscrub_webhook_2025_xyz123";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-webhook-secret",
};

// Normalization function for company name matching
function normalizeCompanyName(name: string): string {
  return name
    .toUpperCase()
    .replace(/[.,\/#!$%\^&\*;:{}=\-_`~()]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\b(INC|LLC|CORP|CO|LTD|CORPORATION|L\.L\.C|PLLC)\b/g, '')
    .trim();
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
        JSON.stringify({ success: false, error: "Unauthorized - invalid or missing webhook secret" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Only accept POST requests
    if (req.method !== "POST") {
      return new Response(
        JSON.stringify({ success: false, error: "Method not allowed" }),
        { status: 405, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Parse JSON body
    const body = await req.json();

    // Validate required fields
    if (!body.company?.legal_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required field: company.legal_name" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!body.application?.owner_1_first_name || !body.application?.owner_1_last_name) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing required owner fields" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Initialize Supabase client with service role key
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
      { auth: { persistSession: false } }
    );

    console.log(`Processing application for: ${body.company.legal_name}`);

    // Get org_id (single org system for now)
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .limit(1)
      .single();

    if (!org) {
      throw new Error("No organization found in database");
    }

    const orgId = org.id;
    console.log(`Using org_id: ${orgId}`);

    // 1. Find or create company using unified entity resolution strategy
    const companyId = await findOrCreateCompanyUnified(
      supabase,
      orgId,
      body.company.legal_name,
      body.company.ein
    );

    // 2. Update company with rich application data (enriches existing or completes new record)
    const { error: companyUpdateError } = await supabase
      .from("companies")
      .update({
        legal_name: body.company.legal_name,
        normalized_legal_name: normalizeCompanyName(body.company.legal_name),
        dba_name: body.company.dba_name,
        ein: body.company.ein,
        industry: body.company.industry,
        address_line1: body.company.address_line1,
        address_line2: body.company.address_line2,
        city: body.company.city,
        state: body.company.state,
        zip: body.company.zip,
        phone: body.company.phone,
        email: body.company.email,
        website: body.company.website,
        updated_at: new Date().toISOString(),
      })
      .eq("id", companyId);

    if (companyUpdateError) {
      console.error("Failed to update company with application data:", companyUpdateError);
      // Log but don't fail - company exists with basic data
    }

    // 3. Create submission record
    const submissionId = crypto.randomUUID();

    const { error: submissionError } = await supabase
      .from("submissions")
      .insert({
        id: submissionId,
        org_id: orgId,
        user_id: "00000000-0000-0000-0000-000000000001", // System user for API ingestion
        ingestion_method: "api",
        status: "completed",
      });

    if (submissionError) {
      console.error("Failed to create submission:", submissionError);
      throw new Error(`Failed to create submission: ${submissionError.message}`);
    }

    console.log(`Created submission: ${submissionId}`);

    // 4. Create application record (map v2 schema to existing columns)
    const app = body.application;

    // Combine owner name parts
    const owner1Name = `${app.owner_1_first_name}${app.owner_1_middle_name ? ' ' + app.owner_1_middle_name : ''} ${app.owner_1_last_name}`;
    const owner2Name = app.owner_2_first_name && app.owner_2_last_name
      ? `${app.owner_2_first_name}${app.owner_2_middle_name ? ' ' + app.owner_2_middle_name : ''} ${app.owner_2_last_name}`
      : null;

    // Format addresses as strings
    const owner1Address = app.owner_1_address
      ? `${app.owner_1_address.address_line1}${app.owner_1_address.address_line2 ? ' ' + app.owner_1_address.address_line2 : ''}, ${app.owner_1_address.city}, ${app.owner_1_address.state} ${app.owner_1_address.zip}`
      : null;

    const owner2Address = app.owner_2_address
      ? `${app.owner_2_address.address_line1}${app.owner_2_address.address_line2 ? ' ' + app.owner_2_address.address_line2 : ''}, ${app.owner_2_address.city}, ${app.owner_2_address.state} ${app.owner_2_address.zip}`
      : null;

    // Use cell_phone primarily, fallback to home_phone
    const owner1Phone = app.owner_1_cell_phone || app.owner_1_home_phone;
    const owner2Phone = app.owner_2_cell_phone || app.owner_2_home_phone;

    const { data: newApplication, error: applicationError } = await supabase
      .from("applications")
      .insert({
        submission_id: submissionId,
        company_id: companyId,
        business_name: body.company.legal_name,
        business_structure: app.business_structure,
        years_in_business: app.years_in_business,
        number_of_employees: app.number_of_employees,
        annual_revenue: app.annual_revenue,
        funding_amount: app.amount_requested, // Map to existing column
        funding_purpose: app.loan_purpose, // Map to existing column
        owner_1_name: owner1Name,
        owner_1_ssn_last4: app.owner_1_ssn ? app.owner_1_ssn.slice(-4) : null,
        owner_1_ownership_pct: app.owner_1_ownership_pct ? app.owner_1_ownership_pct / 100 : null, // Convert to decimal
        owner_1_address: owner1Address,
        owner_1_phone: owner1Phone,
        owner_1_email: app.owner_1_email,
        owner_2_name: owner2Name,
        owner_2_ssn_last4: app.owner_2_ssn ? app.owner_2_ssn.slice(-4) : null,
        owner_2_ownership_pct: app.owner_2_ownership_pct ? app.owner_2_ownership_pct / 100 : null,
        owner_2_address: owner2Address,
        owner_2_phone: owner2Phone,
        owner_2_email: app.owner_2_email,
        confidence_score: body.confidence_score,
        raw_extracted_data: body, // Store full v2 payload for reference
      })
      .select("id")
      .single();

    if (applicationError || !newApplication) {
      console.error("Failed to create application:", applicationError);
      throw new Error(`Failed to create application: ${applicationError?.message}`);
    }

    const applicationId = newApplication.id;
    console.log(`Created application: ${applicationId}`);

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        data: {
          application_id: applicationId,
          company_id: companyId,
          submission_id: submissionId,
        },
        message: "Application intake successful",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Application intake error:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message || "Internal server error",
        details: error.toString(),
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
