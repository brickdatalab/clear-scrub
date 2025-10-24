import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

Deno.serve(async (req: Request) => {
  // Handle OPTIONS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
      },
    });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }

  try {
    // Get JWT from Authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    const token = authHeader.substring(7);

    // Parse request body
    const body = await req.json();
    const { doc_id } = body;

    if (!doc_id) {
      return new Response(JSON.stringify({ error: "Missing doc_id" }), {
        status: 400,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    console.log(`Processing document: ${doc_id}`);

    // Create client with user's JWT (for RLS enforcement)
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      },
    });

    // Get document details (verify ownership via RLS)
    const { data: doc, error: docError } = await supabaseClient
      .from("documents")
      .select("id, submission_id, file_path, org_id")
      .eq("id", doc_id)
      .single();

    if (docError || !doc) {
      console.error(`Document not found or access denied: ${docError?.message}`);
      return new Response(JSON.stringify({ error: "Document not found or access denied" }), {
        status: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    console.log(`Document found: ${doc.file_path}, org: ${doc.org_id}`);

    // Update document status to 'processing'
    const { error: updateError } = await supabaseClient
      .from("documents")
      .update({
        status: "processing",
        processing_started_at: new Date().toISOString(),
      })
      .eq("id", doc_id);

    if (updateError) {
      console.error(`Failed to update document status: ${updateError.message}`);
      return new Response(JSON.stringify({ error: "Failed to update document status" }), {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      });
    }

    console.log(`Document status updated to 'processing'`);

    // Call statement-schema-intake webhook with file_path and metadata
    // This triggers OCR processing via LlamaIndex + Mistral
    const webhookSecret = Deno.env.get("WEBHOOK_SECRET") || "clearscrub_webhook_2025_xyz123";

    console.log(`Calling statement-schema-intake webhook...`);

    const intakeResponse = await fetch(
      `${supabaseUrl}/functions/v1/statement-schema-intake`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Secret": webhookSecret,
        },
        body: JSON.stringify({
          file_path: doc.file_path,
          submission_id: doc.submission_id,
          org_id: doc.org_id,
          doc_id: doc_id,
        }),
      }
    );

    if (!intakeResponse.ok) {
      // Log error but don't fail the request (async processing)
      const errorText = await intakeResponse.text();
      console.error(`Intake webhook failed (${intakeResponse.status}): ${errorText}`);

      // Update document status to 'failed' if webhook fails
      await supabaseClient
        .from("documents")
        .update({
          status: "failed",
          processing_completed_at: new Date().toISOString(),
          error_message: `Webhook failed: ${intakeResponse.status}`,
        })
        .eq("id", doc_id);
    } else {
      console.log(`Webhook called successfully: ${intakeResponse.status}`);
    }

    // Return 202 Accepted (processing started asynchronously)
    return new Response(
      JSON.stringify({
        status: "accepted",
        doc_id: doc_id,
        message: "Document queued for processing",
      }),
      {
        status: 202,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (error) {
    console.error("Enqueue error:", error);
    return new Response(JSON.stringify({
      error: "Internal server error",
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    });
  }
});
