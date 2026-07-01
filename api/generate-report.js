// api/generate-report.js
// Server-side proxy for report generation. This keeps your Anthropic API key
// off the client and off the wire — the browser never talks to api.anthropic.com
// directly. Requires ANTHROPIC_API_KEY to be set in Vercel Project Settings
// → Environment Variables (Production, Preview, and Development).

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { systemPrompt, userPrompt } = req.body || {};

  if (!systemPrompt || !userPrompt) {
    return res.status(400).json({ error: "Missing systemPrompt or userPrompt" });
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY is not set in the environment");
    return res.status(500).json({ error: "Server misconfiguration: missing API key" });
  }

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": process.env.ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-6",
        max_tokens: 8192,
        system: systemPrompt,
        messages: [{ role: "user", content: userPrompt }],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      console.error("Anthropic API error:", response.status, errText);
      return res.status(502).json({ error: "Upstream engine error", detail: errText });
    }

    const data = await response.json();
    return res.status(200).json(data);
  } catch (err) {
    console.error("generate-report handler error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}
