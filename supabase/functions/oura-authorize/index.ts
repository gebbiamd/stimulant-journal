const OURA_SCOPE = "email personal daily heartrate tag workout session spo2 ring_configuration stress heart_health";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Content-Type": "application/json",
};

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const userId = Deno.env.get("SHORTCUT_USER_ID");
  if (!userId) {
    return new Response(JSON.stringify({ error: "Server not configured: missing SHORTCUT_USER_ID" }), {
      status: 500,
      headers: corsHeaders,
    });
  }

  const authUrl = new URL("https://cloud.ouraring.com/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", Deno.env.get("OURA_CLIENT_ID")!);
  authUrl.searchParams.set("redirect_uri", `${Deno.env.get("SUPABASE_URL")}/functions/v1/oura-callback`);
  authUrl.searchParams.set("scope", OURA_SCOPE);
  authUrl.searchParams.set("state", userId);

  const authHeader = request.headers.get("Authorization");
  if (authHeader) {
    return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  return Response.redirect(authUrl.toString(), 302);
});
