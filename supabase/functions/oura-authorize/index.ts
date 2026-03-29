import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const accessToken = new URL(request.url).searchParams.get("access_token");
  if (!accessToken) {
    return new Response("Missing access_token", { status: 400 });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    return new Response("Could not identify user", { status: 401 });
  }

  const authUrl = new URL("https://cloud.ouraring.com/oauth/authorize");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("client_id", Deno.env.get("OURA_CLIENT_ID")!);
  authUrl.searchParams.set("redirect_uri", `${Deno.env.get("SUPABASE_URL")}/functions/v1/oura-callback`);
  authUrl.searchParams.set("scope", "daily heartrate personal");
  authUrl.searchParams.set("state", data.user.id);

  return Response.redirect(authUrl.toString(), 302);
});
