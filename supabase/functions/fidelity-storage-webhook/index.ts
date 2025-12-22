/**
 * fidelity-storage-webhook
 * Triggered by Database Webhook on storage.objects INSERT
 * When PDF uploads to fidelity-clear bucket:
 * 1. Insert into fid_docs
 * 2. POST to https://flow.clearscrub.io/webhook/fidbankstart
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method_not_allowed" }), { status: 405 });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return new Response(JSON.stringify({ error: "missing_env_vars" }), { status: 500 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // Parse webhook payload
  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "invalid_json" }), { status: 400 });
  }

  const record = payload?.record;
  if (!record) {
    return new Response(JSON.stringify({ error: "missing_record" }), { status: 400 });
  }

  const bucketId = record.bucket_id;
  const objectName = record.name;

  // Only process fidelity-clear bucket
  if (bucketId !== "fidelity-clear") {
    console.log("Skipping non-fidelity-clear bucket:", bucketId);
    return new Response(JSON.stringify({ ok: true, skipped: true }), { status: 200 });
  }

  if (!objectName || typeof objectName !== "string") {
    return new Response(JSON.stringify({ error: "invalid_object_name" }), { status: 400 });
  }

  // Parse submission_id from path: {submission_uuid}/{filename}.pdf
  const parts = objectName.split("/");
  if (parts.length < 2) {
    return new Response(
      JSON.stringify({ error: "invalid_path_format", detail: "expected: submission_uuid/filename.pdf" }),
      { status: 400 }
    );
  }
  const submissionId = parts[0];
  const filename = parts.slice(1).join("/");

  // Get public URL
  const pub = supabase.storage.from("fidelity-clear").getPublicUrl(objectName);
  const publicUrl = pub?.data?.publicUrl;
  if (!publicUrl) {
    return new Response(JSON.stringify({ error: "could_not_derive_public_url" }), { status: 500 });
  }

  // Insert into fid_docs and get ID back
  const { data: inserted, error: insertErr } = await supabase
    .from("fid_docs")
    .insert({
      fid_submission_id: submissionId,
      public_url: publicUrl,
    })
    .select("id, fid_submission_id, public_url")
    .single();

  if (insertErr) {
    console.error("fid_docs insert failed:", insertErr);
    return new Response(
      JSON.stringify({ error: "fid_docs_insert_failed", detail: insertErr.message }),
      { status: 500 }
    );
  }

  // POST to external webhook
  try {
    const resp = await fetch("https://flow.clearscrub.io/webhook/fidbankstart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        id: inserted.id,
        fid_submission_id: inserted.fid_submission_id,
        public_url: inserted.public_url,
      }),
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => "");
      console.error("fidbankstart webhook non-200:", resp.status, text);
    } else {
      console.log("Successfully POSTed to fidbankstart webhook");
    }
  } catch (e) {
    console.error("fidbankstart webhook POST failed:", e);
  }

  return new Response(
    JSON.stringify({
      ok: true,
      submission_id: submissionId,
      filename,
      doc_id: inserted.id,
      public_url: publicUrl,
    }),
    { status: 200 }
  );
});
