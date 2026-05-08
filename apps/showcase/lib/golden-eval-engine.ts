import type { DemoCatalogFile } from "./csv-demo-search";
import { searchCsvDemoCatalog } from "./csv-demo-search";

export type GoldenQueryCase = {
  id: string;
  query: string;
  /** If any of these appear in the top-N result titles (EN), case fails. */
  forbidSubstringInTitlesTopN?: { n: number; substrings: string[] };
  /** At least one top-N title must include one of these (lowercase match). */
  requireAnySubstringInTitlesTopN?: { n: number; substrings: string[] };
  /** First result must be this product_id */
  expectTopProductId?: string;
  /** At least one ranked hit in the top-N window must match these product_ids (score-tie tolerant). */
  expectAnyProductIdInTopN?: { n: number; productIds: string[] };
  requireMinTotal?: number;
};

export type GoldenCaseResult = {
  id: string;
  pass: boolean;
  detail?: string;
  topTitles?: string[];
  total?: number;
};

export type GoldenReport = {
  version: number;
  passed: number;
  failed: number;
  scorePercent: number;
  cases: GoldenCaseResult[];
};

function titleEn(p: { title?: { en?: string } }): string {
  return String(p.title?.en ?? "").toLowerCase();
}

export function evaluateGoldenCases(
  catalog: DemoCatalogFile,
  cases: GoldenQueryCase[],
  tenantId = "demo-sl",
): GoldenReport {
  const out: GoldenCaseResult[] = [];

  for (const c of cases) {
    const r = searchCsvDemoCatalog(catalog, c.query, tenantId, { from: 0, size: 24 }, {});
    const titles = (r.products ?? []).map((p) => titleEn(p));
    const topN = (n: number) => titles.slice(0, n);

    let pass = true;
    let detail: string | undefined;

    if (typeof c.requireMinTotal === "number" && r.total < c.requireMinTotal) {
      pass = false;
      detail = `total ${r.total} < ${c.requireMinTotal}`;
    }

    if (c.expectTopProductId && r.products[0]?.product_id !== c.expectTopProductId) {
      pass = false;
      detail = `top product_id got ${r.products[0]?.product_id ?? "none"} want ${c.expectTopProductId}`;
    }

    const anyTop = c.expectAnyProductIdInTopN;
    if (anyTop && pass) {
      const want = new Set(anyTop.productIds);
      const slice = (r.products ?? []).slice(0, anyTop.n);
      const ok = slice.some((p) => want.has(String(p.product_id ?? "")));
      if (!ok) {
        pass = false;
        detail = `none of [${anyTop.productIds.join(", ")}] in top ${anyTop.n} product_id`;
      }
    }

    const forbid = c.forbidSubstringInTitlesTopN;
    if (forbid && pass) {
      const window = topN(forbid.n);
      for (const sub of forbid.substrings) {
        const s = sub.toLowerCase();
        if (window.some((t) => t.includes(s))) {
          pass = false;
          detail = `forbidden "${sub}" in top ${forbid.n} titles`;
          break;
        }
      }
    }

    const req = c.requireAnySubstringInTitlesTopN;
    if (req && pass) {
      const window = topN(req.n);
      const ok = req.substrings.some((sub) => window.some((t) => t.includes(sub.toLowerCase())));
      if (!ok) {
        pass = false;
        detail = `none of [${req.substrings.join(", ")}] in top ${req.n} titles`;
      }
    }

    out.push({
      id: c.id,
      pass,
      detail,
      topTitles: titles.slice(0, 5),
      total: r.total,
    });
  }

  const passed = out.filter((x) => x.pass).length;
  const failed = out.length - passed;
  return {
    version: 1,
    passed,
    failed,
    scorePercent: out.length ? Math.round((passed / out.length) * 1000) / 10 : 0,
    cases: out,
  };
}
