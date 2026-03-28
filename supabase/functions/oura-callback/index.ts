import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const userId = url.searchParams.get("state");
  if (!code || !userId) {
    return new Response("Missing code or state", { status: 400 });
  }

  const tokenResponse = await fetch("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: `${Deno.env.get("SUPABASE_URL")}/functions/v1/oura-callback`,
      client_id: Deno.env.get("OURA_CLIENT_ID")!,
      client_secret: Deno.env.get("OURA_CLIENT_SECRET")!,
    }),
  });

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    return new Response(JSON.stringify(tokenPayload), { status: tokenResponse.status });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const expiresAt = tokenPayload.expires_in
    ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
    : null;

  const { error } = await admin.from("oura_connections").upsert({
    user_id: userId,
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token,
    token_type: tokenPayload.token_type,
    expires_at: expiresAt,
    scope: tokenPayload.scope || "daily",
  }, { onConflict: "user_id" });

  if (error) {
    return new Response(error.message, { status: 500 });
  }

  return Response.redirect(`${Deno.env.get("SITE_URL")}/summary.html`, 302);
});
