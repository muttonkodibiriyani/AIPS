import { afterEach, describe, expect, it, vi } from "vitest";

import type { DemoCatalogFile, ProductRecord } from "./csv-demo-search";
import { searchCsvDemoCatalog } from "./csv-demo-search";
import { fetchLlmSearchAugment, fetchLlmSearchAugmentTeam, llmAugmentFromJson, mergeLlmAugments, sparseQueriesFromModelJson } from "./llm-intent";

describe("sparseQueriesFromModelJson", () => {
  it("normalises and caps five concrete queries", () => {
    const q = sparseQueriesFromModelJson({
      queries: [
        "Organic cotton duvet cover queen pale grey",
        "dupe",
        "  linen shirt men relaxed short sleeve beige  ",
        "Organic cotton duvet cover queen pale grey",
        " stoneware vase white ",
        "x".repeat(200),
      ],
    });
    expect(q.length).toBeLessThanOrEqual(5);
    expect(q[0]?.includes("duvet")).toBe(true);
    expect(q.every((s) => s.length >= 4 && s.length <= 140)).toBe(true);
  });

  it("returns empty for malformed payloads", () => {
    expect(sparseQueriesFromModelJson(null)).toEqual([]);
    expect(sparseQueriesFromModelJson({})).toEqual([]);
    expect(sparseQueriesFromModelJson({ searches: ["a"] })).toEqual([]);
  });
});

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

describe("mergeLlmAugments", () => {
  it("keeps first gender and unions other fields", () => {
    const m = mergeLlmAugments([
      { gender: "men", expandedLexical: "sandals sliders", merchSlugs: ["footwear_sandals_slides"] },
      {
        gender: "women",
        apparelOnly: true,
        expandedLexical: "beach lightweight",
        extraColors: ["navy"],
        negatedTerms: ["belt"],
        merchSlugs: ["footwear_sneakers"],
      },
    ]);
    expect(m?.gender).toBe("men");
    expect(m?.apparelOnly).toBe(true);
    expect(m?.extraColors).toContain("navy");
    expect(m?.merchSlugs?.length ?? 0).toBeGreaterThanOrEqual(2);
    expect(m?.expandedLexical?.includes("sandals")).toBe(true);
    expect(m?.expandedLexical?.includes("lightweight")).toBe(true);
  });
});

describe("fetchLlmSearchAugmentTeam / fetchLlmSearchAugment (mocked fetch)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.GEMINI_API_KEY;
    delete process.env.OPENROUTER_API_KEY;
    delete process.env.SHOWCASE_LLM_INTENT;
    delete process.env.SHOWCASE_LLM_PARALLEL;
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

  it("falls back to OpenRouter when Gemini returns non-OK (parallel team — both may be invoked)", async () => {
    process.env.GEMINI_API_KEY = "bad";
    process.env.OPENROUTER_API_KEY = "or-key";
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockImplementation((url: string | Request) => {
          const u = String(url);
          if (u.includes("generativelanguage.googleapis.com")) {
            return Promise.resolve({ ok: false, json: async () => ({}) });
          }
          if (u.includes("openrouter.ai")) {
            return Promise.resolve({
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
            });
          }
          return Promise.resolve({ ok: false, json: async () => ({}) });
        }),
    );

    const team = await fetchLlmSearchAugmentTeam("summer open shoes");
    expect(team.parallel).toBe(true);
    expect(team.merged?.merchSlugs).toEqual(["footwear_sandals_slides"]);
    expect(fetch).toHaveBeenCalled();
  });

  it("runs Gemini and OpenRouter in parallel when both keys are set", async () => {
    process.env.GEMINI_API_KEY = "g";
    process.env.OPENROUTER_API_KEY = "o";
    vi.stubGlobal(
      "fetch",
      vi.fn().mockImplementation((url: string | Request) => {
        const u = String(url);
        if (u.includes("generativelanguage.googleapis.com")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              candidates: [
                {
                  content: {
                    parts: [
                      {
                        text: JSON.stringify({
                          gender: "men",
                          apparel_only: false,
                          expanded_keywords: "sandals",
                          merch_slugs: ["footwear_sandals_slides"],
                          colors: [],
                          negated_terms: [],
                        }),
                      },
                    ],
                  },
                },
              ],
            }),
          });
        }
        if (u.includes("openrouter.ai")) {
          return Promise.resolve({
            ok: true,
            json: async () => ({
              choices: [
                {
                  message: {
                    content: JSON.stringify({
                      gender: null,
                      apparel_only: false,
                      expanded_keywords: "flip flops",
                      merch_slugs: ["footwear_sandals_slides"],
                      colors: ["black"],
                      negated_terms: [],
                    }),
                  },
                },
              ],
            }),
          });
        }
        return Promise.resolve({ ok: false, json: async () => ({}) });
      }),
    );

    const team = await fetchLlmSearchAugmentTeam("men summer shoes");
    expect(team.parallel).toBe(true);
    expect(team.memberCount).toBeGreaterThanOrEqual(1);
    expect(team.merged?.gender).toBe("men");
    expect(team.merged?.extraColors).toContain("black");
    expect(fetch).toHaveBeenCalled();
  });

  it("uses sequential fallback when SHOWCASE_LLM_PARALLEL=false", async () => {
    process.env.GEMINI_API_KEY = "bad";
    process.env.OPENROUTER_API_KEY = "or-key";
    process.env.SHOWCASE_LLM_PARALLEL = "false";
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

    const team = await fetchLlmSearchAugmentTeam("summer open shoes");
    expect(team.parallel).toBe(false);
    expect(team.merged?.merchSlugs).toEqual(["footwear_sandals_slides"]);
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
