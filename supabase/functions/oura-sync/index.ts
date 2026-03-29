import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

async function fetchWithTimeout(input: string, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, {
      ...init,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Oura request timed out after ${Math.round(timeoutMs / 1000)} seconds.`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function fetchOuraJson(url: string, accessToken: string) {
  const response = await fetchWithTimeout(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
  }, 15000);
  const payload = await response.json();
  return { response, payload };
}

function getOuraErrorText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const parts = [
    (payload as Record<string, unknown>).error,
    (payload as Record<string, unknown>).message,
    (payload as Record<string, unknown>).error_description,
  ]
    .filter((value) => typeof value === "string")
    .map((value) => String(value).toLowerCase());
  return parts.join(" ");
}

function isOuraAuthFailure(response: Response, payload: unknown) {
  if (response.status === 401) return true;
  const text = getOuraErrorText(payload);
  return Boolean(text) && /(invalid jwt|token|unauthoriz|forbidden|expired)/i.test(text);
}

async function fetchOptionalOuraCollection(path: string, accessToken: string, query: URLSearchParams) {
  try {
    const { response, payload } = await fetchOuraJson(
      `https://api.ouraring.com/v2/usercollection/${path}?${query.toString()}`,
      accessToken
    );
    if (!response.ok) {
      return { ok: false, data: [], error: payload };
    }
    return { ok: true, data: Array.isArray(payload?.data) ? payload.data : [], error: null };
  } catch (error) {
    return { ok: false, data: [], error };
  }
}

async function refreshOuraToken(admin: ReturnType<typeof createClient>, connection: {
  user_id: string;
  refresh_token: string | null;
}) {
  if (!connection.refresh_token) {
    throw new Error("Oura connection needs to be reconnected.");
  }

  const tokenResponse = await fetchWithTimeout("https://api.ouraring.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: connection.refresh_token,
      client_id: Deno.env.get("OURA_CLIENT_ID")!,
      client_secret: Deno.env.get("OURA_CLIENT_SECRET")!,
    }),
  }, 15000);

  const tokenPayload = await tokenResponse.json();
  if (!tokenResponse.ok) {
    throw new Error(tokenPayload.error_description || tokenPayload.error || "Failed to refresh Oura token.");
  }

  const expiresAt = tokenPayload.expires_in
    ? new Date(Date.now() + Number(tokenPayload.expires_in) * 1000).toISOString()
    : null;

  const nextConnection = {
    ...connection,
    access_token: tokenPayload.access_token,
    refresh_token: tokenPayload.refresh_token || connection.refresh_token,
    token_type: tokenPayload.token_type || "Bearer",
    expires_at: expiresAt,
    scope: tokenPayload.scope || null,
    updated_at: new Date().toISOString(),
  };

  const { error } = await admin
    .from("oura_connections")
    .update({
      access_token: nextConnection.access_token,
      refresh_token: nextConnection.refresh_token,
      token_type: nextConnection.token_type,
      expires_at: nextConnection.expires_at,
      scope: nextConnection.scope,
      updated_at: nextConnection.updated_at,
    })
    .eq("user_id", connection.user_id);

  if (error) throw new Error(error.message);
  return nextConnection;
}

async function fetchOuraJsonWithRefresh(
  admin: ReturnType<typeof createClient>,
  connection: {
    user_id: string;
    access_token: string;
    refresh_token: string | null;
    token_type?: string | null;
    expires_at?: string | null;
    scope?: string | null;
    updated_at?: string | null;
  },
  url: string,
) {
  let activeConnection = connection;
  let result = await fetchOuraJson(url, activeConnection.access_token);

  if (!isOuraAuthFailure(result.response, result.payload)) {
    return { ...result, connection: activeConnection };
  }

  activeConnection = await refreshOuraToken(admin, activeConnection);
  result = await fetchOuraJson(url, activeConnection.access_token);
  return { ...result, connection: activeConnection };
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  const authHeader = request.headers.get("Authorization");
  if (!authHeader) return json({ error: "Missing auth header" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user) {
    return json({ error: "Not signed in" }, 401);
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
    return json({ error: "Oura is not connected for this account." }, 400);
  }

  let activeConnection = connection;
  const expiresAt = activeConnection.expires_at ? new Date(activeConnection.expires_at).getTime() : 0;
  if (expiresAt && expiresAt <= Date.now() + 60_000) {
    try {
      activeConnection = await refreshOuraToken(admin, activeConnection);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Failed to refresh Oura token." }, 400);
    }
  }

  const endDate = new Date();
  const startDate = new Date(endDate.getTime() - 29 * 24 * 60 * 60 * 1000);
  const query = new URLSearchParams({
    start_date: startDate.toISOString().slice(0, 10),
    end_date: endDate.toISOString().slice(0, 10),
  });

  let response;
  let payload;
  try {
    const initialResult = await fetchOuraJsonWithRefresh(
      admin,
      activeConnection,
      `https://api.ouraring.com/v2/usercollection/sleep?${query.toString()}`,
    );
    response = initialResult.response;
    payload = initialResult.payload;
    activeConnection = initialResult.connection;
  } catch (error) {
    return json({ error: error instanceof Error ? error.message : "Failed to refresh Oura token." }, 400);
  }

  if (!response.ok) {
    return json(payload, response.status);
  }

  const dailySleepResult = await fetchOuraJsonWithRefresh(
    admin,
    activeConnection,
    `https://api.ouraring.com/v2/usercollection/daily_sleep?${query.toString()}`,
  );
  activeConnection = dailySleepResult.connection;
  const { response: dailyResponse, payload: dailyPayload } = dailySleepResult;
  const readinessResult = await fetchOptionalOuraCollection("daily_readiness", activeConnection.access_token, query);
  const stressResult = await fetchOptionalOuraCollection("daily_stress", activeConnection.access_token, query);
  const resilienceResult = await fetchOptionalOuraCollection("daily_resilience", activeConnection.access_token, query);
  const heartrateResult = await fetchOptionalOuraCollection("heartrate", activeConnection.access_token, query);
  const dailyItems = Array.isArray(dailyPayload?.data) ? dailyPayload.data : [];
  const dailyScoreByDay = new Map(
    dailyItems
      .filter((item) => item && item.day)
      .map((item) => [item.day, item])
  );

  const mergedByDay = new Map<string, Record<string, unknown>>();

  if (Array.isArray(payload?.data)) {
    for (const item of payload.data) {
      if (!item?.day) continue;
      const dailyItem = dailyScoreByDay.get(item.day) || null;
      mergedByDay.set(item.day, {
        ...item,
        score: dailyItem?.score ?? item?.score ?? null,
        total_sleep_duration: dailyItem?.total_sleep_duration ?? item?.total_sleep_duration ?? null,
        time_in_bed: dailyItem?.time_in_bed ?? item?.time_in_bed ?? null,
        daily_sleep: dailyItem,
      });
    }
  }

  for (const dailyItem of dailyItems) {
    if (!dailyItem?.day || mergedByDay.has(dailyItem.day)) continue;
    mergedByDay.set(dailyItem.day, {
      day: dailyItem.day,
      score: dailyItem.score ?? null,
      total_sleep_duration: dailyItem.total_sleep_duration ?? null,
      time_in_bed: dailyItem.time_in_bed ?? null,
      bedtime_start: null,
      bedtime_end: null,
      daily_sleep: dailyItem,
    });
  }

  const mergedPayload = {
    ...payload,
    daily_data: dailyResponse.ok ? dailyItems : [],
    readiness: readinessResult.data,
    stress: stressResult.data,
    resilience: resilienceResult.data,
    heartrate: heartrateResult.data,
    data: Array.from(mergedByDay.values()),
  };

  return json(mergedPayload, response.status);
});
