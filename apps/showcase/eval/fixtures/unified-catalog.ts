/**
 * Synthetic catalog assembling scenarios used by golden-query evaluation (deterministic CI).
 */
import type { DemoCatalogFile, ProductRecord } from "../../lib/csv-demo-search";

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

export function unifiedEvalCatalog(): DemoCatalogFile {
  return {
    generatedAt: "eval-fixture",
    rowCount: 0,
    products: [
      P({
        product_id: "cooler-bag",
        sku: "HM-COOL-01",
        title: { en: "Cool bag with a shoulder strap", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "bags_accessories", color: "Black" },
        pricing: { aed: 89 },
        search_text: "cool bag shoulder strap insulated picnic lunch men black",
      }),
      P({
        product_id: "midi-dress",
        sku: "HM-DRS-99",
        title: { en: "Satin strappy midi dress", ar: "" },
        attrs: { customer_group: ",Woman,", retrieval_category: "dresses_skirts", color: "Black" },
        pricing: { aed: 199 },
        search_text: "satin strappy midi dress party evening cocktail summer woman black",
      }),
      P({
        product_id: "duvet",
        sku: "272598294",
        title: { en: "Linen-blend double/king size duvet cover set", ar: "" },
        attrs: { customer_group: "Man | Woman", retrieval_category: "home_living", color: "Light pink" },
        pricing: { aed: 449 },
        search_text:
          "linen blend duvet cover set summer breathable lightweight bedroom light pink king holiday home living",
      }),
      P({
        product_id: "shirt",
        sku: "274000001",
        title: { en: "Relaxed-fit linen resort shirt", ar: "" },
        attrs: { customer_group: ",Man,", retrieval_category: "tops_shirts_blouses", color: "Beige" },
        pricing: { aed: 129 },
        search_text: "linen shirt relaxed fit men summer breathable resort vacation beige casual",
      }),
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
      P({
        product_id: "m-shoe",
        sku: "M-SN",
        title: { en: "Running sneakers", ar: "" },
        attrs: { retrieval_category: "footwear_sneakers", customer_group: ",Man,", size: "43", color: "Black" },
        pricing: { aed: 399 },
        search_text: "running sneakers man black cushioning",
      }),
      P({
        product_id: "w-shoe",
        sku: "W-SN",
        title: { en: "Walking sneakers mesh", ar: "" },
        attrs: { retrieval_category: "footwear_sneakers", customer_group: ",Woman,", size: "38", color: "Pink" },
        pricing: { aed: 359 },
        search_text: "walking sneakers breathable mesh pink woman summer trainers",
      }),
    ],
  };
}
