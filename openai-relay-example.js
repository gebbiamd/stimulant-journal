export default {
  async fetch(request, env) {
    if (request.method !== "POST") {
      return new Response("Method not allowed", { status: 405 });
    }

    const { model = "gpt-5.4", journal } = await request.json();

    const prompt = [
      "You are summarizing a private stimulant journal.",
      "Provide a concise structured summary with these sections:",
      "1. Overall pattern",
      "2. Sleep correlation if available",
      "3. Journal themes",
      "4. Non-medical behavior observations",
      "Do not give medical advice. Do not recommend dose changes.",
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
