import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import type { GoldenQueryCase } from "../lib/golden-eval-engine";
import { evaluateGoldenCases } from "../lib/golden-eval-engine";
import { unifiedEvalCatalog } from "./fixtures/unified-catalog";

const __dir = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(__dir, "golden-queries.json");
const outDir = join(__dir, "results");

const raw = JSON.parse(readFileSync(goldenPath, "utf8")) as { version: number; cases: GoldenQueryCase[] };
const catalog = unifiedEvalCatalog();
const report = evaluateGoldenCases(catalog, raw.cases, "demo-sl");

try {
  mkdirSync(outDir, { recursive: true });
} catch {
  /* exists */
}
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outfile = join(outDir, `golden-${stamp}.json`);
writeFileSync(outfile, JSON.stringify(report, null, 2), "utf8");

console.log(
  JSON.stringify(
    {
      scorePercent: report.scorePercent,
      passed: report.passed,
      failed: report.failed,
      written: outfile,
    },
    null,
    2,
  ),
);

if (report.failed > 0) {
  console.error("Failed cases:", report.cases.filter((c) => !c.pass));
  process.exit(1);
}
