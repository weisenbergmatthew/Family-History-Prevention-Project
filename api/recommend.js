import Anthropic from "@anthropic-ai/sdk";
import { guard } from "./_guard.js";

// Synthesis is the heavier call; allow up to 60s (Vercel Hobby max).
export const config = { maxDuration: 60 };

const client = new Anthropic(); // reads ANTHROPIC_API_KEY from the environment

const SYSTEM = `You are a preventive-medicine assistant. Given a person's FAMILY health history (a list of conditions, each with the affected relatives and their relationship), produce ONE unified, personalized prevention plan for that person.

GROUND EVERY RECOMMENDATION in current, reputable guidelines. Draw on the U.S. Preventive Services Task Force (USPSTF) for screening, plus the leading body for each disease area, including but not limited to:
- Cardiovascular / blood pressure / cholesterol: ACC/AHA
- Type 2 diabetes / prediabetes: American Diabetes Association (ADA)
- Stroke: AHA/ASA
- Cancer screening: USPSTF and the American Cancer Society (ACS); hereditary-cancer risk and genetic testing: NCCN
- Colorectal: USPSTF/ACS/ACG; Breast & women's health: ACOG/ACS; Prostate/urology: AUA; Lung: USPSTF
- Skin/melanoma: American Academy of Dermatology (AAD)
- Kidney: KDIGO; Liver: AASLD; GI: AGA/ACG
- Lung/COPD/asthma: GOLD / American Thoracic Society (ATS)
- Bone/osteoporosis: Bone Health & Osteoporosis Foundation / USPSTF
- Rheumatology/autoimmune: ACR
- Neurology & dementia: American Academy of Neurology (AAN), Alzheimer's Association, the Lancet Commission on dementia prevention
- Thyroid/endocrine: American Thyroid Association / Endocrine Society
- Mental health: APA / USPSTF
- Alcohol: NIAAA
Use whichever bodies are most relevant to the conditions provided; you are not limited to this list.

OUTPUT REQUIREMENTS:
- Produce a SINGLE consolidated plan across exactly five categories: diet, exercise, sleep, screening, lifestyle. Do NOT produce separate plans per condition.
- DEDUPLICATE aggressively: if multiple conditions call for a similar action (e.g. "≥150 min/week of moderate aerobic activity"), state it ONCE as a single recommendation and attribute it to all the relevant conditions.
- For EACH recommendation, populate "conditions" with the family condition name(s) that recommendation is driven by (list all that apply, using the exact condition names given in the input). Use general/foundational items (empty conditions array) sparingly and only when broadly protective.
- Weight proximity and prevalence: give more prominent, specific guidance for conditions affecting closer relatives (parents/siblings) or multiple relatives. "screening" should include personalized items such as starting screening earlier than the general population, more frequent screening, or referral for genetic counseling when the family history warrants it.
- AGE OF ONSET: when a relative's age at diagnosis is given, use it. Early onset is a strong hereditary signal — for example, any cancer before ~50, coronary/cardiovascular disease before ~55 in men or ~65 in women, or early-onset dementia. For early-onset conditions, explicitly recommend starting the relevant screening EARLIER than the general population (a common rule is 10 years before the relative's diagnosis age, or by a specific age) and consider referral for genetic counseling/testing. You may reference the specific onset age. Ages of onset are only provided for some relatives; do not assume anything when they are absent.
- BE RUTHLESSLY CONCISE. Each recommendation is a short imperative fragment — a directive, not a sentence. Hard limit: 12 words. State the action plus any concrete number/target, then STOP.
- NEVER include a rationale, justification, or explanation of risk. This is the most important rule. Forbidden: any clause explaining WHY, and any clause beginning with "to", "since", "because", "as", "which", "given that", or containing "risk", "linked to", "associated with", "helps", "supports", "reduces", "increases", "improves". The condition tag already conveys the why — do not restate it.
- Transform verbose → tight. Examples:
  - BAD: "Aim for ≥150 min/week of moderate aerobic activity plus resistance training to lower blood pressure and improve insulin sensitivity."  GOOD: "≥150 min/week moderate aerobic activity + resistance training 2×/week."
  - BAD: "Limit alcohol to ≤1 drink/day since alcohol is linked to higher breast cancer risk."  GOOD: "Limit alcohol to ≤1 drink/day."
  - BAD: "Maintain 7–9 hours nightly; poor sleep is linked to hypertension and insulin resistance."  GOOD: "7–9 hours of sleep nightly, consistent schedule."
  - BAD: "Discuss with your clinician about starting mammography at age 30–40 given your mother's diagnosis at 41, and consider genetic counseling."  GOOD: "Start mammograms by ~31 (10 yrs before mother's dx); ask about MRI + BRCA testing."
- Keep it tight: at most 3 items per category (1-2 if the history is sparse); merge related advice into one line. Highest-impact only. Don't fabricate exact screening ages — where timing is individual, say "ask your clinician about timing".
- This is educational content, not a diagnosis or medical advice. Do not address the user by name.
- "sources" is a concise list of the guideline bodies you drew on (e.g. ["USPSTF","ACC/AHA","ADA","ACS/NCCN"]).

Respond with ONLY valid JSON matching this exact shape, and nothing else:
{"categories":{"diet":[{"text":"...","conditions":["..."]}],"exercise":[...],"sleep":[...],"screening":[...],"lifestyle":[...]},"sources":["..."]}`;

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === "string") { try { return JSON.parse(req.body); } catch { return {}; } }
  return req.body;
}

function extractJson(text) {
  if (!text) return null;
  const fenced = text.replace(/```json/gi, "```").split("```").map(s => s.trim()).filter(Boolean);
  const candidates = [text, ...fenced];
  for (const c of candidates) {
    const start = c.indexOf("{");
    const end = c.lastIndexOf("}");
    if (start === -1 || end === -1) continue;
    try {
      const obj = JSON.parse(c.slice(start, end + 1));
      if (obj && obj.categories) return obj;
    } catch { /* try next */ }
  }
  return null;
}

const CATS = ["diet", "exercise", "sleep", "screening", "lifestyle"];

function sanitize(data) {
  const categories = {};
  for (const cat of CATS) {
    const items = Array.isArray(data?.categories?.[cat]) ? data.categories[cat] : [];
    categories[cat] = items
      .filter(it => it && typeof it.text === "string" && it.text.trim())
      .slice(0, 8)
      .map(it => ({
        text: it.text.trim(),
        conditions: Array.isArray(it.conditions)
          ? it.conditions.filter(x => typeof x === "string" && x.trim()).map(x => x.trim())
          : [],
      }));
  }
  const sources = Array.isArray(data?.sources)
    ? data.sources.filter(x => typeof x === "string" && x.trim()).map(x => x.trim()).slice(0, 12)
    : [];
  return { categories, sources };
}

export default async function handler(req, res) {
  if (!guard(req, res, { limit: 12, windowMs: 60000 })) return;

  const { conditions } = parseBody(req);
  if (!Array.isArray(conditions) || conditions.length === 0) {
    res.status(400).json({ error: "no_conditions" });
    return;
  }

  // Trim payload defensively.
  const clean = conditions.slice(0, 40).map(c => ({
    name: String(c?.name || "").slice(0, 80),
    level: ["high", "mod", "low"].includes(c?.level) ? c.level : "low",
    relatives: Array.isArray(c?.relatives)
      ? c.relatives.slice(0, 20).map(r => ({
          role: String(r?.role || "").slice(0, 40),
          degree: Number(r?.degree) || 2,
          onsetAge: Number.isInteger(r?.onsetAge) ? r.onsetAge : null,
        }))
      : [],
  })).filter(c => c.name);

  const levelWord = { high: "higher priority", mod: "moderate", low: "worth noting" };
  const lines = clean.map(c => {
    const rel = c.relatives.map(r =>
      `${r.role}${r.degree === 1 ? " [first-degree]" : ""}${Number.isInteger(r.onsetAge) ? ` (diagnosed at age ${r.onsetAge})` : ""}`
    ).join(", ");
    return `- ${c.name} (${levelWord[c.level]}): affected relatives — ${rel || "unspecified"}`;
  }).join("\n");

  const userMsg = `Here is the person's family health history. First-degree relatives are parents and siblings; second-degree are grandparents, aunts, and uncles.\n\n${lines}\n\nProduce the unified prevention plan as specified.`;

  try {
    const msg = await client.messages.create({
      model: "claude-haiku-4-5",
      max_tokens: 4096,
      system: SYSTEM,
      messages: [{ role: "user", content: userMsg }],
    });
    const out = (msg.content || []).find(b => b.type === "text")?.text || "";
    const data = extractJson(out);
    if (!data) { res.status(502).json({ error: "bad_model_output" }); return; }
    res.status(200).json(sanitize(data));
  } catch (e) {
    res.status(502).json({ error: "recommend_failed", message: String(e?.message || e) });
  }
}
