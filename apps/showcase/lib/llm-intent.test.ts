import { afterEach, describe, expect, it, vi } from "vitest";

import type { DemoCatalogFile, ProductRecord } from "./csv-demo-search";
import { searchCsvDemoCatalog } from "./csv-demo-search";
import { fetchLlmSearchAugment, llmAugmentFromJson } from "./llm-intent";

describe("llmAugmentFromJson", () => {
  it("maps recognised fields", () => {
    const aug = llmAugmentFromJson({
      gender: "men",
      apparel_only: true,
      expanded_keywords: "sandals sliders beach",
      merch_slugs: ["footwear_sandals_slides", "invalid_slug"],
      colors: ["navy"],
      negated_terms: ["curtain", "belt"],
    });
    expect(aug).toEqual({
      gender: "men",
      apparelOnly: true,
      expandedLexical: "sandals sliders beach",
      merchSlugs: ["footwear_sandals_slides"],
      extraColors: ["navy"],
      negatedTerms: ["curtain", "belt"],
    });
  });

  it("returns null when object is empty-ish", () => {
    expect(llmAugmentFromJson({})).toBeNull();
    expect(llmAugmentFromJson(null)).toBeNull();
  });
});

describe("fetchLlmSearchAugment (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.SHOWCASE_LLM_INTENT;
  });

  it("prefers Gemini and parses JSON text", async () => {
    process.env.GEMINI_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: {
                parts: [
                  {
                    text: JSON.stringify({
                      gender: "women",
                      apparel_only: false,
                      expanded_keywords: "trainers running",
                      merch_slugs: ["footwear_sneakers"],
                      colors: [],
                      negated_terms: [],
                    }),
                  },
                ],
              },
            },
          ],
        }),
      }),
    );

    const aug = await fetchLlmSearchAugment("comfy shoes for jogging");
    expect(aug?.gender).toBe("women");
    expect(aug?.merchSlugs).toEqual(["footwear_sneakers"]);
    expect(fetch).toHaveBeenCalledTimes(1);
    const url = String((fetch as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]);
    expect(url).toContain("generativelanguage.googleapis.com");
  });

  it("falls back to OpenRouter when Gemini returns non-OK", async () => {
    process.env.GEMINI_API_KEY = "bad";
    process.env.OPENROUTER_API_KEY = "or-key";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({ ok: false, json: async () => ({}) })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            choices: [
              {
                message: {
                  content: JSON.stringify({
                    gender: null,
                    apparel_only: false,
                    expanded_keywords: "sandals flat",
                    merch_slugs: ["footwear_sandals_slides"],
                    colors: [],
                    negated_terms: [],
                  }),
                },
              },
            ],
          }),
        }),
    );

    const aug = await fetchLlmSearchAugment("summer open shoes");
    expect(aug?.merchSlugs).toEqual(["footwear_sandals_slides"]);
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});

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

describe("searchCsvDemoCatalog + llmAugment", () => {
  const cat: DemoCatalogFile = {
    products: [
      P({
        product_id: "wm1",
        sku: "SKU-WM",
        title: { en: "Tasselled sandals", ar: "" },
        attrs: { customer_group: ",Woman,", retrieval_category: "footwear_sandals_slides", color: "Pink" },
        search_text: "tasselled sandals woman summer party gold pink",
      }),
      P({
        product_id: "m1",
        sku: "SKU-MN",
        title: { en: "Leather sliders", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "footwear_sandals_slides", color: "Brown" },
        search_text: "leather sliders man summer breathable beach brown",
      }),
    ],
  };

  it("applies gender from augment when the raw query omits it", () => {
    const r = searchCsvDemoCatalog(cat, "sandals summer", "demo", { from: 0, size: 5 }, {
      llmAugment: { gender: "men" },
    });
    expect(r.products[0]?.product_id).toBe("m1");
  });

  it("suppresses docs containing negated terms", () => {
    const twoMen: DemoCatalogFile = {
      products: [
        P({
          product_id: "party",
          sku: "S-PARTY",
          title: { en: "Party sandals", ar: "" },
          attrs: { customer_group: ",Man,", retrieval_category: "footwear_sandals_slides" },
          search_text: "party sandals man gold evening beach",
        }),
        P({
          product_id: "plain",
          sku: "S-PLAIN",
          title: { en: "Beach sliders", ar: "" },
          attrs: { customer_group: ",Man,", retrieval_category: "footwear_sandals_slides" },
          search_text: "beach sliders sandals man summer brown casual",
        }),
      ],
    };
    const r = searchCsvDemoCatalog(twoMen, "men sandals summer", "demo", { from: 0, size: 5 }, {
      llmAugment: { negatedTerms: ["party"] },
    });
    expect(r.products[0]?.product_id).toBe("plain");
  });
});
