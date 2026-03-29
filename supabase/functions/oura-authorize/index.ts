import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

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

  const authHeader = request.headers.get("Authorization");
  const accessToken =
    authHeader?.replace(/^Bearer\s+/i, "").trim() ||
    new URL(request.url).searchParams.get("access_token");
  if (!accessToken) {
    return new Response(JSON.stringify({ error: "Missing access token" }), {
      status: 400,
      headers: corsHeaders,
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return new Response(JSON.stringify({ error: "Could not identify user" }), {
      status: 401,
      headers: corsHeaders,
    });
  }

  const authUrl = new URL("https://cloud.ouraring.com/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", Deno.env.get("OURA_CLIENT_ID")!);
  authUrl.searchParams.set("redirect_uri", `${Deno.env.get("SUPABASE_URL")}/functions/v1/oura-callback`);
  authUrl.searchParams.set("scope", OURA_SCOPE);
  authUrl.searchParams.set("state", data.user.id);

  if (authHeader) {
    return new Response(JSON.stringify({ auth_url: authUrl.toString() }), {
      status: 200,
      headers: corsHeaders,
    });
  }

  return Response.redirect(authUrl.toString(), 302);
});
