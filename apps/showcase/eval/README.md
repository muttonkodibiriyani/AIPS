# Offline golden-query evaluation

Runs **deterministic** checks on a **synthetic unified catalog** (`fixtures/unified-catalog.ts`) so CI can detect search regressions without live OpenSearch or LLM keys.

```bash
cd apps/showcase
npm install
npm run test
npm run eval:golden
```

- **`npm run test`** — includes `lib/golden-eval.test.ts` (must stay at 100% pass on the fixture catalog).
- **`npm run eval:golden`** — writes a timestamped JSON report under `eval/results/` (gitignored).

Expand `eval/golden-queries.json` as you add intents. For **live** catalog regression, run the showcase against `demo-catalog.json` manually or add a separate non-CI job (results will depend on merchant data).
