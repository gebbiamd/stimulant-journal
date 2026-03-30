import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const userId = Deno.env.get("SHORTCUT_USER_ID");
  if (!userId) return json({ error: "Server not configured: missing SHORTCUT_USER_ID" }, 500);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: connection, error } = await admin
    .from("oura_connections")
    .select("access_token, scope, expires_at, updated_at")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) {
    return json({ error: error.message }, 500);
  }

  if (!connection) {
    return json({ connected: false });
  }

  // Verify the token actually works by calling Oura
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 8000);
    const verifyResponse = await fetch("https://api.ouraring.com/v2/user/personal_info", {
      headers: { Authorization: `Bearer ${connection.access_token}` },
      signal: controller.signal,
    });
    clearTimeout(timeoutId);

    if (!verifyResponse.ok) {
      return json({
        connected: false,
        scope: connection.scope || null,
        expires_at: connection.expires_at || null,
        updated_at: connection.updated_at || null,
        token_invalid: true,
      });
    }
  } catch {
    // Network error during verify — report connected but unverified
    return json({
      connected: true,
      scope: connection.scope || null,
      expires_at: connection.expires_at || null,
      updated_at: connection.updated_at || null,
      verified: false,
    });
  }

  return json({
    connected: true,
    scope: connection.scope || null,
    expires_at: connection.expires_at || null,
    updated_at: connection.updated_at || null,
    verified: true,
  });
});
