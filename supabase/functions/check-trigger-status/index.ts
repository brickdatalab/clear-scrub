import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async () => {
  try {
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Direct SQL to check function exists
    const { data: functionCheck, error: funcError } = await supabaseAdmin.rpc(
      "exec_sql",
      { query: "SELECT proname FROM pg_proc WHERE proname = 'handle_new_user'" }
    );

    // Direct SQL to check trigger exists
    const { data: triggerCheck, error: trigError } = await supabaseAdmin.rpc(
      "exec_sql",
      { query: "SELECT tgname FROM pg_trigger WHERE tgname = 'on_auth_user_created'" }
    );

    return new Response(
      JSON.stringify({
        function_exists: functionCheck,
        function_error: funcError?.message,
        trigger_exists: triggerCheck,
        trigger_error: trigError?.message,
      }, null, 2),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    return new Response(
      JSON.stringify({ error: error.message }, null, 2),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
