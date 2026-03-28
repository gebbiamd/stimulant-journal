import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders,
  });
}

function hasExplicitTimezone(value: string) {
  return /(?:Z|[+-]\d{2}:\d{2})$/i.test(value);
}

function isValidUtcOffset(value: string) {
  return /^[+-]\d{2}:\d{2}$/.test(value);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  const expectedSecret = Deno.env.get("SHORTCUT_SHARED_SECRET");
  const shortcutUserId = Deno.env.get("SHORTCUT_USER_ID");
  if (!expectedSecret || !shortcutUserId) {
    return json({ ok: false, error: "Shortcut webhook is not configured." }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice("Bearer ".length) : "";
  if (providedSecret !== expectedSecret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  const dose = Number(payload.dose);
  const timestamp = String(payload.timestamp || "").trim();
  const note = String(payload.note || "").trim();
  const utcOffset = String(payload.utc_offset || "").trim();

  if (!Number.isFinite(dose)) {
    return json({ ok: false, error: "dose must be numeric" }, 400);
  }
  if (!timestamp) {
    return json({ ok: false, error: "timestamp is required" }, 400);
  }
  if (utcOffset && !isValidUtcOffset(utcOffset)) {
    return json({ ok: false, error: "utc_offset must look like -05:00 or +01:00" }, 400);
  }

  const parsedTimestamp = new Date(
    !hasExplicitTimezone(timestamp) && utcOffset ? `${timestamp}${utcOffset}` : timestamp
  );
  if (Number.isNaN(parsedTimestamp.getTime())) {
    return json({ ok: false, error: "timestamp must be a valid ISO date string" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data: settingsRow, error: settingsError } = await admin
    .from("user_settings")
    .select("mg_per_tablet")
    .eq("user_id", shortcutUserId)
    .maybeSingle();

  if (settingsError) {
    return json({ ok: false, error: settingsError.message }, 500);
  }

  const mgPerTablet = Number(settingsRow?.mg_per_tablet || 10);
  const hasDose = dose > 0;

  const entryPayload = {
    user_id: shortcutUserId,
    type: hasDose ? "dose" : "note",
    timestamp: parsedTimestamp.toISOString(),
    amount: hasDose ? dose * mgPerTablet : null,
    tablet_count: hasDose ? dose : null,
    mg_per_tablet: hasDose ? mgPerTablet : null,
    note,
  };

  const { error: insertError } = await admin.from("journal_entries").insert(entryPayload);
  if (insertError) {
    return json({ ok: false, error: insertError.message }, 500);
  }

  return json({
    ok: true,
    saved: {
      type: entryPayload.type,
      dose,
      timestamp: entryPayload.timestamp,
      mg_per_tablet: mgPerTablet,
      utc_offset: utcOffset || null,
    },
  });
});
