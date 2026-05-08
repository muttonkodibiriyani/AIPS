import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import type { GoldenQueryCase } from "./golden-eval-engine";
import { evaluateGoldenCases } from "./golden-eval-engine";
import { unifiedEvalCatalog } from "../eval/fixtures/unified-catalog";

const __dir = dirname(fileURLToPath(import.meta.url));
const goldenPath = join(__dir, "..", "eval", "golden-queries.json");

describe("golden-queries.json (offline retrieval regression)", () => {
  it("passes all golden cases on unified eval catalog", () => {
    const raw = JSON.parse(readFileSync(goldenPath, "utf8")) as { cases: GoldenQueryCase[] };
    const report = evaluateGoldenCases(unifiedEvalCatalog(), raw.cases, "demo-sl");
    expect(report.failed, JSON.stringify(report.cases.filter((c) => !c.pass), null, 2)).toBe(0);
    expect(report.scorePercent).toBe(100);
  });
});
