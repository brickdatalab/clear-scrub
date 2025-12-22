/**
 * fid-results-webhook
 * Receives processing results and updates public.fid_docs.schema.
 *
 * Security:
 * - Requires header: x-hook-secret = Deno.env.FID_RESULTS_WEBHOOK_SECRET
 *
 * Request JSON (exact):
 * {
 *   "submission_id": "<uuid>",
 *   "filename": "<original filename with extension>",
 *   "schema": { ... } // arbitrary JSON
 * }
 */

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function json(resBody: unknown, status = 200, extraHeaders: Record<string, string> = {}) {
  return new Response(JSON.stringify(resBody), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "content-type, x-hook-secret",
      ...extraHeaders,
    },
  });
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return json({ ok: true });
  }
  if (req.method !== "POST") {
    return json({ error: "method_not_allowed" }, 405);
  }

  const hookSecret = req.headers.get("x-hook-secret");
  const expected = Deno.env.get("FID_RESULTS_WEBHOOK_SECRET");
  if (!expected || !hookSecret || hookSecret !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server_misconfigured_supabase_env" }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let payload: any;
  try {
    payload = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const submissionId = payload?.submission_id;
  const filename = payload?.filename;
  const resultSchema = payload?.schema;

  if (!submissionId || typeof submissionId !== "string") {
    return json({ error: "missing_submission_id" }, 400);
  }
  if (!filename || typeof filename !== "string") {
    return json({ error: "missing_filename" }, 400);
  }
  if (typeof resultSchema === "undefined") {
    return json({ error: "missing_schema" }, 400);
  }

  // Build object path and public URL exactly as used on upload
  const objectPath = `${submissionId}/${filename}`;
  const pub = supabase.storage.from("fidelity-clear").getPublicUrl(objectPath);
  const publicUrl = pub?.data?.publicUrl;
  if (!publicUrl) {
    return json({ error: "could_not_derive_public_url" }, 500);
  }

  // Ensure a fid_docs row exists (in case Storage webhook arrived late or was misconfigured)
  const { data: existing, error: findErr } = await supabase
    .from("fid_docs")
    .select("id, schema")
    .eq("fid_submission_id", submissionId)
    .eq("public_url", publicUrl)
    .maybeSingle();

  if (findErr) {
    return json({ error: "lookup_failed", detail: findErr.message }, 500);
  }

  if (!existing) {
    // Try to insert a pending row; requires that fid_subs exists
    const { error: insertErr } = await supabase
      .from("fid_docs")
      .insert({ fid_submission_id: submissionId, public_url: publicUrl });

    if (insertErr) {
      return json({ error: "insert_missing_doc_failed", detail: insertErr.message }, 500);
    }
  }

  // Update the schema JSON
  const { error: updateErr } = await supabase
    .from("fid_docs")
    .update({ schema: resultSchema })
    .eq("fid_submission_id", submissionId)
    .eq("public_url", publicUrl);

  if (updateErr) {
    return json({ error: "update_failed", detail: updateErr.message }, 500);
  }

  // Realtime will emit an UPDATE event here
  return json({ ok: true, submission_id: submissionId, filename });
});
