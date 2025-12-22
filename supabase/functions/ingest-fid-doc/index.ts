/**
 * ingest-fid-doc
 * Receives Supabase Storage "Object Created" webhooks for bucket "fidelity-clear".
 * Inserts a pending row into public.fid_docs (schema = null) for the corresponding submission.
 *
 * Security:
 * - Requires header: x-hook-secret = Deno.env.FID_STORAGE_HOOK_SECRET
 *
 * Request payload (examples vary by Supabase; we accept either form):
 * {
 *   "type": "OBJECT_CREATED",
 *   "record": { "bucket_id": "fidelity-clear", "name": "<submission_uuid>/<filename>.pdf", "metadata": { "mimetype": "application/pdf" } }
 * }
 * or
 * {
 *   "type": "INSERT",
 *   "table": "objects",
 *   "record": { "bucket_id": "fidelity-clear", "name": "<submission_uuid>/<filename>.pdf", "metadata": { "mimetype": "application/pdf" } }
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
  const expected = Deno.env.get("FID_STORAGE_HOOK_SECRET");
  if (!expected || !hookSecret || hookSecret !== expected) {
    return json({ error: "unauthorized" }, 401);
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return json({ error: "server_misconfigured_supabase_env" }, 500);
  }
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  let body: any;
  try {
    body = await req.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  const record = body?.record;
  if (!record || typeof record !== "object") {
    return json({ error: "missing_record" }, 400);
  }

  const bucketId = record.bucket_id;
  const objectName = record.name;
  const mimetype = record?.metadata?.mimetype || record?.mimetype || "";

  if (bucketId !== "fidelity-clear") {
    return json({ error: "wrong_bucket", detail: bucketId }, 400);
  }
  if (!objectName || typeof objectName !== "string") {
    return json({ error: "missing_object_name" }, 400);
  }

  const parts = objectName.split("/");
  if (parts.length < 2) {
    return json({ error: "invalid_object_path", detail: "expected <submission_uuid>/<filename>" }, 400);
  }
  const submissionId = parts[0];
  const filename = parts.slice(1).join("/");

  // Strongly prefer PDFs
  if (!mimetype || !mimetype.toLowerCase().includes("pdf") || !filename.toLowerCase().endsWith(".pdf")) {
    // Still insert to allow processor to decide, but tag as non-pdf if needed later.
    // Proceed without blocking.
  }

  // Build the public URL as Supabase exposes it for the object
  const pub = supabase.storage.from("fidelity-clear").getPublicUrl(objectName);
  const publicUrl = pub?.data?.publicUrl;
  if (!publicUrl) {
    return json({ error: "could_not_derive_public_url" }, 500);
  }

  // Insert pending document row and get the ID back
  const insertPayload = {
    fid_submission_id: submissionId,
    public_url: publicUrl,
    // schema remains null until results webhook updates it
  };

  const { data: inserted, error: insertErr } = await supabase
    .from("fid_docs")
    .insert(insertPayload)
    .select('id, fid_submission_id, public_url')
    .single();

  if (insertErr) {
    // Typically occurs if submission row not yet created; front-end must insert fid_subs before upload.
    return json({ error: "fid_docs_insert_failed", detail: insertErr.message }, 500);
  }

  // POST to processing webhook
  try {
    const resp = await fetch('https://flow.clearscrub.io/webhook/fidbankstart', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: inserted.id,
        fid_submission_id: inserted.fid_submission_id,
        public_url: inserted.public_url
      })
    });

    if (!resp.ok) {
      const text = await resp.text().catch(() => '');
      console.error('fidbankstart webhook non-200', resp.status, text);
    }
  } catch (e) {
    console.error('fidbankstart webhook POST failed', e);
  }

  return json({ ok: true, submission_id: submissionId, filename, public_url: publicUrl, doc_id: inserted.id });
});
