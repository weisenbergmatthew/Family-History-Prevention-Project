import Anthropic from "@anthropic-ai/sdk";

// Cap serverless duration (Claude call). Vercel Hobby allows up to 60s.
export const config = { maxDuration: 60 };

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const SYSTEM = `You are a clinical information-extraction assistant for a family-health-history app.

You are given a short, free-text note describing ONE family member's health history. Identify the distinct, diagnosable medical conditions or diseases it mentions.

Rules:
- Return each condition using a clear, STANDARDIZED clinical name so that the same condition is always written the same way (e.g. "Type 2 diabetes", "Coronary artery disease", "Hypertension", "High cholesterol", "Stroke", "Breast cancer", "Colorectal cancer", "Chronic kidney disease", "Atrial fibrillation", "COPD", "Osteoporosis", "Alzheimer's disease"). Normalize lay terms and synonyms ("heart attack" -> "Coronary artery disease", "high blood pressure" -> "Hypertension", "sugar" / "diabetes" without type -> "Type 2 diabetes" unless the text clearly indicates type 1, "colon cancer" -> "Colorectal cancer").
- Include a condition only if the text implies an actual diagnosis or clear health condition. Skip vague statements ("was sick", "not healthy"), transient issues, and pure risk factors unless stated as a diagnosis.
- Merge duplicates; never invent conditions the text does not support.
- If an age of onset or diagnosis is stated, capture it as an integer in onsetAge; otherwise use null.
- Be specific about cancers when the site is given (e.g. "prostate cancer" -> "Prostate cancer"); use "Cancer (unspecified)" only when no site is given.
- If nothing diagnosable is present, return an empty conditions array.

Respond with ONLY valid JSON matching this exact shape, and nothing else:
{"conditions":[{"name":"<standardized condition name>","onsetAge":<integer or null>}]}`;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function extractJson(text) {
  if (!text) return { conditions: [] };
  // Be resilient to stray prose or code fences around the JSON.
  const fenced = text.replace(/```json/gi, "```").split("```").map(s => s.trim()).filter(Boolean);
  const candidates = [text, ...fenced];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end === -1) continue;
    try {
      const obj = JSON.parse(c.slice(start, end + 1));
      if (obj && Array.isArray(obj.conditions)) return obj;
    } catch { /* try next */ }
  }
  return { conditions: [] };
}

export default async function handler(req, res) {
  if (req.method !== "POST") { res.status(405).json({ error: "method_not_allowed" }); return; }

  const { text } = parseBody(req);
  if (typeof text !== "string" || !text.trim()) { res.status(200).json({ conditions: [] }); return; }

  try {
    const msg = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      system: SYSTEM,
      messages: [{ role: "user", content: text.slice(0, 2000) }],
    });
    const out = (msg.content || []).find(b => b.type === "text")?.text || "";
    const data = extractJson(out);
    const conditions = (data.conditions || [])
      .filter(c => c && typeof c.name === "string" && c.name.trim())
      .slice(0, 25)
      .map(c => ({
        name: c.name.trim().slice(0, 80),
        onsetAge: Number.isInteger(c.onsetAge) ? c.onsetAge : null,
      }));
    res.status(200).json({ conditions });
  } catch (e) {
    res.status(502).json({ error: "extract_failed", message: String(e?.message || e) });
  }
}
