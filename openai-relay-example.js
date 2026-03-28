export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { model = "gpt-5.4", journal } = await request.json();

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

    const response = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${env.OPENAI_API_KEY}`,
      },
      body: JSON.stringify({
        model,
        input: prompt,
      }),
    });

    const data = await response.json();
    const summary = data.output_text || data.output?.[0]?.content?.[0]?.text || "No summary returned.";

    return new Response(JSON.stringify({ summary }), {
      headers: { "Content-Type": "application/json" },
    });
  },
};
