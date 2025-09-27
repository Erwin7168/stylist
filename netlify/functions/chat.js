// netlify/functions/chat.js
// Geen node-fetch nodig: gebruikt globale fetch (Node 18+ / Netlify runtime)

const DEFAULT_MODEL = process.env.OPENAI_MODEL || "gpt-4o"; // veilige default

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors(), body: "" };
  }
  if (event.httpMethod !== "POST") {
    return json(405, { error: "Method Not Allowed" });
  }

  try {
    if (!process.env.OPENAI_API_KEY) {
      return json(500, { error: "Missing OPENAI_API_KEY" });
    }

    let body;
    try {
      body = JSON.parse(event.body || "{}");
    } catch {
      return json(400, { error: "Invalid JSON body" });
    }

    const clientMessages = Array.isArray(body.messages) ? body.messages : [];
    if (!clientMessages.length) {
      return json(400, { error: "Missing messages" });
    }

    // Server-side system prompt (optioneel)
    const sys = (process.env.SYSTEM_PROMPT || "").trim();
    const history = [];
    if (sys) history.push({ role: "system", content: sys });

    // Voeg clientberichten toe (negeer eventuele client-side 'system')
    for (const m of clientMessages) {
      if (!m || !m.role || !m.content) continue;
      if (m.role === "system") continue;
      history.push({ role: m.role, content: String(m.content) });
    }

    const messages = history.slice(-28);

    const resp = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,       // zet evt. via env OPENAI_MODEL
        messages,
        temperature: 0.6,
      }),
    });

    // Lees response-body altijd uit (ook bij fouten)
    const data = await resp.json().catch(() => ({}));

    if (!resp.ok) {
      // Geef duidelijke fout door aan de frontend
      const msg =
        data?.error?.message ||
        data?.error ||
        `OpenAI error (status ${resp.status})`;
      return json(resp.status, { error: msg });
    }

    const reply = data?.choices?.[0]?.message?.content || "";
    const newHistory = messages.concat([{ role: "assistant", content: reply }]);
    return json(200, { reply, history: newHistory });
  } catch (e) {
    return json(500, { error: e?.message || "Server error" });
  }
};

function cors() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Content-Type": "application/json; charset=utf-8",
  };
}
function json(statusCode, obj) {
  return { statusCode, headers: cors(), body: JSON.stringify(obj) };
}
