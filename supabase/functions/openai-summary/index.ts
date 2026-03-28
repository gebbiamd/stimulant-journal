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

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const openAiApiKey = Deno.env.get("OPENAI_API_KEY");
  if (!openAiApiKey) {
    return json({ error: "OPENAI_API_KEY is not configured." }, 500);
  }

  let payload: Record<string, unknown>;
  try {
    payload = await request.json();
  } catch {
    return json({ error: "Invalid JSON body." }, 400);
  }

  const model = String(payload.model || "gpt-5.4").trim() || "gpt-5.4";
  const journal = payload.journal;
  if (!journal || typeof journal !== "object") {
    return json({ error: "journal payload is required." }, 400);
  }

  const prompt = [
    "You are summarizing a private stimulant journal that includes Oura sleep data and derived sleep/dose features.",
    "Use the derived Oura context when available instead of only restating raw records.",
    "Provide a concise structured summary with these sections:",
    "1. Overall pattern",
    "2. Sleep and timing patterns",
    "3. Journal themes and context",
    "4. Friction points or recovery patterns",
    "5. Questions worth watching next week",
    "Make concrete observations from the data.",
    "Do not give medical advice. Do not recommend dose changes. Do not invent facts that are not in the payload.",
    `Data: ${JSON.stringify(journal)}`,
  ].join("\n");

  const openAiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${openAiApiKey}`,
    },
    body: JSON.stringify({
      model,
      input: prompt,
    }),
  });

  const data = await openAiResponse.json().catch(() => ({}));
  if (!openAiResponse.ok) {
    const error =
      typeof data?.error?.message === "string"
        ? data.error.message
        : `OpenAI request failed: ${openAiResponse.status}`;
    return json({ error }, openAiResponse.status);
  }

  const summary =
    data.output_text ||
    data.output?.[0]?.content?.[0]?.text ||
    "No summary returned.";

  return json({ summary });
});
