import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}

// HealthKit activity type strings that indicate a gym / strength workout
const GYM_ACTIVITY_TYPES = new Set([
  "HKWorkoutActivityTypeTraditionalStrengthTraining",
  "HKWorkoutActivityTypeFunctionalStrengthTraining",
  "HKWorkoutActivityTypeCoreTraining",
  "HKWorkoutActivityTypeHighIntensityIntervalTraining",
  "HKWorkoutActivityTypeCrossTraining",
  "HKWorkoutActivityTypeYoga",
  "HKWorkoutActivityTypeFlexibility",
  "HKWorkoutActivityTypeElliptical",
  "HKWorkoutActivityTypeStairClimbing",
  "HKWorkoutActivityTypeRowingMachine",
  // Health Auto Export also uses shorter keys — handle both
  "traditionalStrengthTraining",
  "functionalStrengthTraining",
  "coreTraining",
  "highIntensityIntervalTraining",
  "crossTraining",
  "yoga",
  "flexibility",
  "elliptical",
  "stairClimbing",
  "rowingMachine",
]);

function isGymWorkout(activityType: string): boolean {
  if (!activityType) return false;
  if (GYM_ACTIVITY_TYPES.has(activityType)) return true;
  const lower = activityType.toLowerCase();
  return (
    lower.includes("strength") ||
    lower.includes("hiit") ||
    lower.includes("cross") ||
    lower.includes("core") ||
    lower.includes("yoga") ||
    lower.includes("elliptical") ||
    lower.includes("stair") ||
    lower.includes("rowing")
  );
}

function extractNumber(val: unknown): number | null {
  if (val === null || val === undefined) return null;
  if (typeof val === "number") return val;
  if (typeof val === "object" && val !== null && "qty" in val) {
    const n = Number((val as Record<string, unknown>).qty);
    return Number.isFinite(n) ? n : null;
  }
  const n = Number(val);
  return Number.isFinite(n) ? n : null;
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ ok: false, error: "Method not allowed" }, 405);
  }

  // Auth: shared secret in Authorization: Bearer header
  const expectedSecret = Deno.env.get("SHORTCUT_SHARED_SECRET");
  const shortcutUserId = Deno.env.get("SHORTCUT_USER_ID");
  if (!expectedSecret || !shortcutUserId) {
    return json({ ok: false, error: "healthkit-sync is not configured on the server." }, 500);
  }

  const authHeader = request.headers.get("Authorization") || "";
  const providedSecret = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  if (providedSecret !== expectedSecret) {
    return json({ ok: false, error: "Unauthorized" }, 401);
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Invalid JSON body" }, 400);
  }

  // Health Auto Export wraps workouts under a "data" or "workouts" key,
  // or sends an array directly. Support all three shapes.
  let workouts: unknown[];
  if (Array.isArray(body)) {
    workouts = body;
  } else if (body && typeof body === "object") {
    const b = body as Record<string, unknown>;
    const candidate = b.workouts ?? b.data ?? b.Workouts ?? [];
    workouts = Array.isArray(candidate) ? candidate : [candidate];
  } else {
    return json({ ok: false, error: "Expected a JSON object or array" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  let inserted = 0;
  let skipped = 0;
  const errors: string[] = [];

  for (const raw of workouts) {
    if (!raw || typeof raw !== "object") { skipped++; continue; }
    const w = raw as Record<string, unknown>;

    const activityType = String(
      w.workoutActivityType ?? w.activityType ?? w.type ?? w.name ?? ""
    );

    if (!isGymWorkout(activityType)) { skipped++; continue; }

    const startRaw = String(w.start ?? w.startDate ?? w.start_time ?? "");
    const endRaw = String(w.end ?? w.endDate ?? w.end_time ?? "");

    if (!startRaw || !endRaw) { skipped++; continue; }

    const startTime = new Date(startRaw);
    const endTime = new Date(endRaw);
    if (isNaN(startTime.getTime()) || isNaN(endTime.getTime())) { skipped++; continue; }

    const durationRaw = w.duration ?? w.duration_seconds ?? null;
    let durationSeconds = extractNumber(durationRaw);
    // Health Auto Export sends duration as {qty, units} — convert minutes if needed
    if (durationSeconds !== null && typeof durationRaw === "object" && durationRaw !== null) {
      const unit = String((durationRaw as Record<string, unknown>).units ?? "").toLowerCase();
      if (unit === "min" || unit === "minutes") durationSeconds = durationSeconds * 60;
    }
    // Fallback: derive from start/end
    if (durationSeconds === null) {
      durationSeconds = (endTime.getTime() - startTime.getTime()) / 1000;
    }

    const activeEnergy = extractNumber(w.activeEnergy ?? w.active_energy ?? w.activeEnergyBurned ?? null);
    const totalEnergy = extractNumber(w.totalEnergy ?? w.total_energy ?? w.totalEnergyBurned ?? null);
    const avgHR = extractNumber(w.avgHeartRate ?? w.averageHeartRate ?? w.avg_heart_rate ?? null);
    const maxHR = extractNumber(w.maxHeartRate ?? w.max_heart_rate ?? null);
    const sourceName = String(w.sourceName ?? w.source ?? w.sourceApp ?? "Health Auto Export");

    const { error } = await admin.from("gym_workouts").upsert(
      {
        user_id: shortcutUserId,
        source_name: sourceName,
        activity_type: activityType,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        duration_seconds: durationSeconds,
        active_energy_kcal: activeEnergy,
        total_energy_kcal: totalEnergy,
        avg_heart_rate: avgHR,
        max_heart_rate: maxHR,
        raw_payload: raw,
      },
      { onConflict: "user_id,start_time", ignoreDuplicates: false }
    );

    if (error) {
      errors.push(`${startRaw}: ${error.message}`);
    } else {
      inserted++;
    }
  }

  return json({
    ok: true,
    received: workouts.length,
    inserted,
    skipped,
    errors: errors.length > 0 ? errors : undefined,
  });
});
