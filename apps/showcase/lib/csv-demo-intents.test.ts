/**
 * Intent-style NL queries the offline demo is tuned for. Use with a real CSV build
 * or fixtures; each test uses a tiny catalog that encodes the behaviours we expect on
 * the bigger stratified / merch-only JSON.
 */
import { describe, expect, it } from "vitest";

import type { DemoCatalogFile, ProductRecord } from "./csv-demo-search";
import { searchCsvDemoCatalog } from "./csv-demo-search";

function P(p: Partial<ProductRecord> & Pick<ProductRecord, "product_id" | "sku">): ProductRecord {
  return {
    market: "AE",
    title: { en: "", ar: "" },
    images: [],
    availability: true,
    search_text: "",
    ...p,
  };
}

describe("intent: gender + category (men sandals)", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "wm1",
        sku: "SKU-WM",
        title: { en: "Tasselled sandals", ar: "" },
        attrs: { customer_group: ",Woman,", retrieval_category: "footwear_sandals_slides", color: "Pink", size: "39" },
        pricing: { aed: 139 },
        search_text: "tasselled sandals woman summer party gold pink",
      }),
      P({
        product_id: "m1",
        sku: "SKU-MN",
        title: { en: "Leather sliders", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "footwear_sandals_slides", color: "Brown", size: "42" },
        pricing: { aed: 149 },
        search_text: "leather sliders man summer breathable beach brown",
      }),
    ],
  };

  it('NL: "men sandals for summer" — first hit is male customer_group sandals', () => {
    const r = searchCsvDemoCatalog(cat, "men sandals for summer", "demo", { from: 0, size: 5 });
    expect(r.products[0]?.attrs?.customer_group).toMatch(/man/i);
    expect(r.products[0]?.product_id).toBe("m1");
  });
});

describe("intent: price ceiling + home", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "v1",
        sku: "V-300",
        title: { en: "Large vase", ar: "" },
        attrs: { retrieval_category: "home_living", color: "White" },
        pricing: { aed: 250 },
        search_text: "large stoneware vase white minimalist decor living room summer",
      }),
      P({
        product_id: "v2",
        sku: "V-OK",
        title: { en: "Small stoneware vase", ar: "" },
        attrs: { retrieval_category: "home_living", color: "White" },
        pricing: { aed: 120 },
        search_text: "small stoneware vase white minimalist stoneware vase",
      }),
    ],
  };

  it('NL: "white vase under 200 AED"', () => {
    const r = searchCsvDemoCatalog(cat, "white vase under 200 AED", "demo", { from: 0, size: 5 });
    expect(r.products.every((p) => (p.pricing?.aed ?? 999) <= 200)).toBe(true);
    expect(r.products.some((p) => p.product_id === "v2")).toBe(true);
    expect(r.products.some((p) => p.product_id === "v1")).toBe(false);
  });
});

describe("intent: price floor + AED", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "cheap",
        sku: "S-LOW",
        title: { en: "Budget slides", ar: "" },
        attrs: { retrieval_category: "footwear_sandals_slides", customer_group: ",Man,", size: "40" },
        pricing: { aed: 99 },
        search_text: "slides sandal beach man",
      }),
      P({
        product_id: "high",
        sku: "S-HI",
        title: { en: "Premium leather sandals", ar: "" },
        attrs: { retrieval_category: "footwear_sandals_slides", customer_group: ",Man,", size: "41" },
        pricing: { aed: 249 },
        search_text: "premium leather sandals man summer breathable",
      }),
    ],
  };

  it('NL: worth 200 AED above for men sandals', () => {
    const r = searchCsvDemoCatalog(cat, "men sandals worth 200AED above", "demo", { from: 0, size: 5 });
    expect(r.products.map((x) => x.product_id)).toEqual(["high"]);
  });
});

describe("intent: winter men clothing + colours (no belts / blackout curtains)", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "belt",
        sku: "BLT-1",
        title: { en: "M-buckle leather belt", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "bags_accessories", color: "Black" },
        search_text: "m buckle leather belt black man formal",
      }),
      P({
        product_id: "curtain",
        sku: "CUR-1",
        title: { en: "2-pack blackout curtains", ar: "" },
        attrs: { retrieval_category: "home_living", color: "Navy" },
        search_text: "2 pack blackout curtains navy room darkening thermal",
      }),
      P({
        product_id: "coat",
        sku: "PK-1",
        title: { en: "Padded winter parka", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "outerwear", color: "Dark Blue/Black" },
        search_text:
          "padded parka winter jacket men warm fleece lined cold weather snow thermal insulation dark blue black",
      }),
      P({
        product_id: "candle",
        sku: "CAN-1",
        title: { en: "Scented candle in glass", ar: "" },
        attrs: { retrieval_category: "home_living", color: "Black" },
        search_text: "scented candle black glass holder home living",
      }),
    ],
  };

  it('NL: "winter wear for men clothing i need blue and black" prefers outerwear, excludes home + accessories', () => {
    const r = searchCsvDemoCatalog(
      cat,
      "winter wear for men clothing i need blue and black",
      "demo",
      { from: 0, size: 10 },
    );
    const ids = r.products.map((p) => p.product_id);
    expect(ids).toContain("coat");
    expect(ids).not.toContain("belt");
    expect(ids).not.toContain("curtain");
    expect(ids).not.toContain("candle");
    expect(r.products[0]?.product_id).toBe("coat");
  });
});

describe("intent: women sneakers + lexical", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "m-shoe",
        sku: "M-SN",
        title: { en: "Running sneakers", ar: "" },
        attrs: {
          retrieval_category: "footwear_sneakers",
          customer_group: ",Man,",
          size: "43",
          color: "Black",
        },
        pricing: { aed: 399 },
        search_text: "running sneakers man black cushioning",
      }),
      P({
        product_id: "w-shoe",
        sku: "W-SN",
        title: { en: "Walking sneakers mesh", ar: "" },
        attrs: {
          retrieval_category: "footwear_sneakers",
          customer_group: ",Woman,",
          size: "38",
          color: "Pink",
        },
        pricing: { aed: 359 },
        search_text: "walking sneakers breathable mesh pink woman summer trainers",
      }),
    ],
  };

  it('NL: "women pink sneakers trainers summer"', () => {
    const r = searchCsvDemoCatalog(cat, "women pink sneakers trainers summer", "demo", { from: 0, size: 5 });
    expect(r.products[0]?.product_id).toBe("w-shoe");
  });
});

describe("intent: men's summer collection excludes linen bedding (NL noise)", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "duvet",
        sku: "272598294",
        title: { en: "Linen-blend double/king size duvet cover set", ar: "" },
        attrs: {
          customer_group: "Man | Woman",
          retrieval_category: "home_living",
          color: "Light pink",
        },
        pricing: { aed: 449 },
        search_text:
          "linen blend duvet cover set summer breathable lightweight bedroom light pink king holiday home living",
      }),
      P({
        product_id: "shirt",
        sku: "274000001",
        title: { en: "Relaxed-fit linen resort shirt", ar: "" },
        attrs: {
          customer_group: ",Man,",
          retrieval_category: "tops_shirts_blouses",
          color: "Beige",
        },
        pricing: { aed: 129 },
        search_text: "linen shirt relaxed fit men summer breathable resort vacation beige casual",
      }),
    ],
  };

  it('NL: "i wanted to know if there any summer collection for men" — no duvet grid flood', () => {
    const q = "i wanted to know if there any summer collection for men";
    const r = searchCsvDemoCatalog(cat, q, "demo", { from: 0, size: 10 });
    expect(r.products.map((p) => p.product_id)).not.toContain("duvet");
    expect(r.products[0]?.product_id).toBe("shirt");
    expect(r.appliedFilters.apparelDominantHardFilter).toBe(false);
    expect(r.appliedFilters.apparelDominantExcludeHomeOnly).toBe(true);
  });
});

describe("SAMPLE_QUERIES (copy into manual QA with a real merch-only sandals build)", () => {
  it("documents strings for storefront smoke (assert true)", () => {
    const samples = [
      "men sandals for summer",
      "women gladiator sandals under 200 AED",
      "worth 150 SAR above black slides for men",
      "white stoneware vase under 200 AED living room",
      "women pink sneakers summer breathable",
      "boys shorts blue size 8",
      "organic cotton duvet ivory queen under 350 AED",
      "winter wear for men clothing blue and black",
      "i wanted to know if there any summer collection for men",
    ];
    expect(samples.length).toBeGreaterThanOrEqual(6);
  });
});
