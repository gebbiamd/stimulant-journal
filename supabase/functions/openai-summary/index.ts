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
  const mode = String(payload.mode || "summary").trim() || "summary";
  const journal = payload.journal;
  if (!journal || typeof journal !== "object") {
    return json({ error: "journal payload is required." }, 400);
  }

  const baseInstructions = [
    "You are helping with a private stimulant journal that includes Oura sleep, activity, and recovery data.",
    "Treat localDateTime, localTime, bedtimeStartLocal, and bedtimeEndLocal fields as the source of truth for timing.",
    "Do not infer local dose timing from UTC ISO strings.",
    "Use the derived Oura context when available instead of only restating raw records.",
    "When ouraActivity is present, incorporate steps, activity score, and active calories into your analysis.",
    "When ouraWorkouts is present, note exercise sessions and consider how they relate to dose days and sleep quality.",
    "When ouraSpo2 is present, flag any nights with low average blood oxygen (below 95%) as worth noting.",
    "Use emoji heavily when it improves scanability, especially for positive, neutral, and cautionary bullet points.",
    "Do not give medical advice. Do not recommend dose changes. Do not invent facts that are not in the payload.",
  ];

  const messages = Array.isArray(payload.messages) ? payload.messages : [];
  const prompt =
    mode === "chat"
      ? [
          ...baseInstructions,
          "You are in chat mode. Answer the user's question directly using the journal and Oura context.",
          "Be conversational but concise.",
          "Use short headers and emoji bullets where useful.",
          "Do not ask the user follow-up questions unless absolutely necessary.",
          `Journal data: ${JSON.stringify(journal)}`,
          `Conversation: ${JSON.stringify(messages)}`,
        ].join("\n")
      : [
          ...baseInstructions,
          "You are in summary mode.",
          "Provide a concise structured summary with these sections:",
          "1. Overall pattern",
          "2. Sleep and timing patterns",
          "3. Journal themes and context",
          "4. Friction points or recovery patterns",
          "5. Signals to watch next week",
          "Write declarative observations, not direct questions to the user.",
          "Use short headers and emoji bullet lists where useful.",
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

  const text =
    data.output_text ||
    data.output?.[0]?.content?.[0]?.text ||
    "No summary returned.";

  return json(mode === "chat" ? { answer: text } : { summary: text });
});
