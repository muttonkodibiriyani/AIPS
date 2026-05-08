# Commerce AI showcase — search quality rubric (offline CSV + LLM cues)

This project’s **showcase** blends **lexical scoring** over a bundled catalog with **optional LLM JSON intent** (Gemini / OpenRouter). It is **not** a separate trained ranker and **does not** crawl Google or the public web unless you deliberately wire a vendor API ([You.com Search API](https://you.com/home), hosted Perplexity, etc.) behind your own contracts.

Patterns borrowed from stacks like **[Vane](https://github.com/ItzCrazyKns/Vane)** — web retrieval constraints, homonym-aware answering, cited context — translate here into:

1. **Query understanding** (LLM structured fields + deterministic heuristics).
2. **Hard negations** (drop SKUs matching excluded phrases).
3. **Retrieval hints** (`retrieval_category` buckets) before ranking.

## Cannot publish a single “accuracy score” without a benchmark

There is **no universally valid numeric accuracy score** unless you define:

- A **labeled query set** (e.g. 200–500 queries with ideal SKU IDs or relevance grades).
- A **policy** for “acceptable” substitutes (sizes, colours, OOS handling).
- **Metrics**: MRR@k, nDCG@k, Precision@24, segment breakdown (party wear, price filters, RTL, etc.).

**Before heuristic + homonym fixes (screenshot-class failures):**

- Rough **QA rubric**: on creative NL queries mixing **slang** (“cool”), **season** (“summer”), and **occasion** (“party wear”), naive lexical overlap often scores **weak** (say **~2–3 / 5** on “top item relevant”), because SKU titles contain incidental tokens (**“cool bag”** insulated category).

**After party/slang heuristic + STRICT `party wear` grid + cooler negations + score crushing for cooler SKUs:**

- Same rubric expectation: **typically +1–1.5 points** on occasion queries (e.g. **~4 / 5** when the catalog actually contains plausible party SKUs)—still **bounded by catalog recall** (if you only ingest bags, dresses cannot appear).

These are **illustrative** engineering estimates, **not** measured production metrics. Run `npm run test -w @commerce-ai/showcase` for regression tests; collect real scores only after freezing a labeled set.

## Optional “internet context” APIs (commercial)

For **fresh** synonyms or trending fashion phrases ([You.com](https://you.com/home) Search / Research APIs, vendor equivalents), integrate **server-side only** behind env flags: fetch short snippets → append to **`expanded_keywords`** → never trust unvetted snippets as filters without human review.

## Next steps toward measurable quality

1. Freeze **evaluation CSV** slice + golden queries JSON.
2. Add a script that emits MRR/Precision vs golden set.
3. Compare runs **without** vs **with** LLM (`SHOWCASE_LLM_INTENT`) and fusion (`SHOWCASE_SEARCH_FUSION`).
