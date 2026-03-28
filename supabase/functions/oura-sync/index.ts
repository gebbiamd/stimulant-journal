import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

Deno.serve(async (request) => {
  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return new Response(JSON.stringify({ error: "Missing auth header" }), { status: 401 });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return new Response(JSON.stringify({ error: "Not signed in" }), { status: 401 });
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: connection, error: connectionError } = await admin
    .from("oura_connections")
    .select("*")
    .eq("user_id", authData.user.id)
    .maybeSingle();

  if (connectionError || !connection) {
    return new Response(JSON.stringify({ error: "Oura is not connected for this account." }), { status: 400 });
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    start_date: startDate.toISOString().slice(0, 10),
    end_date: endDate.toISOString().slice(0, 10),
  });

  const response = await fetch(`https://api.ouraring.com/v2/usercollection/sleep?${query.toString()}`, {
    headers: { Authorization: `Bearer ${connection.access_token}` },
  });

  const payload = await response.json();
  return new Response(JSON.stringify(payload), {
    status: response.status,
    headers: { "Content-Type": "application/json" },
  });
});
