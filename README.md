# Family History Prevention Project

A single-page web app that turns your family health history into personalized,
guideline-based prevention recommendations.

## What it does

1. **Map your family tree** — grandparents (both sides), parents, aunts/uncles,
   and siblings. Add relatives inline at each level.
2. **Record conditions in plain language** — type what each relative had
   (e.g. "heart attack at 58, high blood pressure, type 2 diabetes"). The app
   recognizes the conditions automatically.
3. **Get a tailored prevention plan** — conditions are aggregated across the
   tree, weighted by how closely related each affected person is (first-degree
   relatives count more than grandparents/aunts/uncles), and mapped to
   prevention guidance across **diet, exercise, sleep, screening, and lifestyle**.

## Guideline sources

Recommendations paraphrase publicly available guidance from:

- **ACC/AHA** — cardiovascular disease, blood pressure, cholesterol
- **American Diabetes Association** — Standards of Care (type 2 diabetes)
- **AHA/ASA** — stroke prevention
- **USPSTF / American Cancer Society** — breast, colorectal, prostate, and skin
  cancer screening
- Plus osteoporosis, dementia, and general cancer-prevention guidance

## How conditions and recommendations are generated

Condition entry is fully free-response. When you save a relative, the app sends
the text to a serverless function ([`api/extract.js`](api/extract.js)) that uses
Claude to identify the specific conditions and normalize them to standard
clinical names — so there is no fixed list to pick from.

"Generate plan" sends the aggregated family history to a second function
([`api/recommend.js`](api/recommend.js)), which asks Claude to synthesize **one
unified, de-duplicated prevention plan** across diet, exercise, sleep, screening,
and lifestyle — grounded in USPSTF plus the leading specialty guideline bodies,
with each recommendation tagged with the family condition(s) it addresses. The
per-condition **risk snapshot** (weighted by number and proximity of affected
relatives) is computed locally and is deterministic.

Both functions require an `ANTHROPIC_API_KEY` environment variable (set it in
the Vercel project settings). If the API is unavailable, the app degrades
gracefully — condition extraction falls back to a local keyword matcher, and the
plan shows a retry.

Model: `claude-haiku-4-5` (chosen for lowest cost per call).

**Abuse protection** ([`api/_guard.js`](api/_guard.js)): the endpoints only accept
same-origin requests (blocks other sites and most direct/scripted calls), apply a
best-effort per-IP rate limit (30/min for extract, 12/min for recommend), and cap
input sizes. Because the site is public and calls run on your API key, this
reduces — but does not fully eliminate — the cost of abuse; for stronger limits,
add a persistent rate-limit store (e.g. Vercel KV) or Vercel's firewall.

## Design

The interface uses a light, editorial **"Monograph"** style: a warm paper
palette, `Newsreader` (serif) paired with `IBM Plex Mono`, and a single reserved
vermilion accent. The family tree is drawn as a proper **clinical genogram** —
squares for male relatives, circles for female, hairline connectors, and
condition "chips" under each person.

## Running it

It's a self-contained static site — no build step or dependencies.

```bash
# any static file server works, e.g.
python3 -m http.server 8042
# then open http://localhost:8042
```

Or just open `index.html` directly in a browser.

Your entries are saved locally in the browser (localStorage); nothing is sent
anywhere.

## Disclaimer

This is an **educational tool, not medical advice**. It does not diagnose and
does not replace a clinician. A strong family history of any condition is a
reason to talk to a doctor and consider genetic counseling.
