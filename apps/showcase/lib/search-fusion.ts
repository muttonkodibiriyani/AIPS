import type { ProductRecord } from "./csv-demo-search";

/**
 * Offline hybrid rank: **`llmWeighted` lane first** (LLM-augmented lexical scores), then unique SKUs from the
 * **pure lexical** lane. Mirrors a tiny “retrieve → parallel lanes → fused ranking” orchestration without ANN/BM25.
 */
export function fuseLlmFirstProductRank(
  llmWeighted: readonly ProductRecord[],
  pureLexical: readonly ProductRecord[],
): ProductRecord[] {
  const seen = new Set<string>();
  const out: ProductRecord[] = [];

  for (const p of llmWeighted) {
    const id = String(p.product_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }

  for (const p of pureLexical) {
    const id = String(p.product_id ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(p);
  }

  return out;
}
