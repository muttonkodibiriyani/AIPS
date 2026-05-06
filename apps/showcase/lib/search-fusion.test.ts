import { describe, expect, it } from "vitest";

import type { ProductRecord } from "./csv-demo-search";
import { fuseLlmFirstProductRank } from "./search-fusion";

function pid(id: string, sku = id): ProductRecord {
  return {
    product_id: id,
    sku,
    market: "AE",
    title: { en: id, ar: "" },
    images: [],
    availability: true,
    search_text: "",
  };
}

describe("fuseLlmFirstProductRank", () => {
  it("orders LLM-weighted lane first and dedupes by product_id", () => {
    const llm = [pid("a"), pid("b")];
    const lex = [pid("b"), pid("c")];
    const fused = fuseLlmFirstProductRank(llm, lex);
    expect(fused.map((p) => p.product_id)).toEqual(["a", "b", "c"]);
  });
});
