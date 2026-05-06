import { describe, expect, it } from "vitest";

import type { DemoCatalogFile } from "./csv-demo-search";
import { genderIntent, searchCsvDemoCatalog } from "./csv-demo-search";

describe("genderIntent", () => {
  it('detects standalone "men" (regression: men\'?s alone does not match "men")', () => {
    expect(genderIntent("men sandals for summer")).toBe("men");
    expect(genderIntent("need men shoes black")).toBe("men");
  });

  it("detects women including standalone women", () => {
    expect(genderIntent("women sandals")).toBe("women");
  });
});

describe("searchCsvDemoCatalog gender + sandals", () => {
  const mini: DemoCatalogFile = {
    products: [
      {
        product_id: "w1",
        sku: "SKU-W",
        market: "AE",
        title: { en: "Gladiator sandals", ar: "" },
        attrs: { customer_group: ",Woman,", retrieval_category: "footwear_sandals_slides" },
        pricing: { aed: 149 },
        images: [],
        availability: true,
        search_text:
          "gladiator sandals open sandals in faux leather. woman summer strappy lightweight pool holiday beach",
      },
      {
        product_id: "m1",
        sku: "SKU-M",
        market: "AE",
        title: { en: "Leather sandals", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "footwear_sandals_slides" },
        pricing: { aed: 159 },
        images: [],
        availability: true,
        search_text:
          "leather sandals wide fit sandals in leather with an adjustable buckle. man summer breathable beach",
      },
    ],
  };

  it("ranks men’s SKU ahead of women’s for men sandals query", () => {
    const r = searchCsvDemoCatalog(mini, "men sandals for summer", "demo", { from: 0, size: 10 });
    expect(r.products[0]?.product_id).toBe("m1");
    expect(r.total).toBeGreaterThanOrEqual(1);
  });
});
