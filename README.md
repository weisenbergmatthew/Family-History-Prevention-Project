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
