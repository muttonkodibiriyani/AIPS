import { describe, expect, it } from "vitest";

import { parsePriceConstraints, productMatchesPriceConstraints } from "./price-constraints";

describe("parsePriceConstraints", () => {
  it("parses floor with compact AED + above (worth …)", () => {
    const p = parsePriceConstraints("i need shirts worth 200AED above");
    expect(p.floor).toBe(200);
    expect(p.cap).toBeNull();
    expect(p.currency).toBe("aed");
  });

  it("parses ceiling under N SAR", () => {
    const p = parsePriceConstraints("Blue jacket under 450 SAR for gifts");
    expect(p.cap).toBe(450);
    expect(p.floor).toBeNull();
    expect(p.currency).toBe("sar");
  });

  it("parses inclusive range", () => {
    const p = parsePriceConstraints("jeans between 100 and 200 aed");
    expect(p.rangeMin).toBe(100);
    expect(p.rangeMax).toBe(200);
    expect(p.floor).toBeNull();
    expect(p.cap).toBeNull();
  });

  it("parses 200+ aed suffix", () => {
    const p = parsePriceConstraints("polo 200+ aed");
    expect(p.floor).toBe(200);
    expect(p.currency).toBe("aed");
  });
});

describe("productMatchesPriceConstraints", () => {
  it("enforces floor in named corridor", () => {
    const floorAed = parsePriceConstraints("shirts above 200 aed");
    expect(productMatchesPriceConstraints({ pricing: { aed: 249, sar: 249 } }, floorAed)).toBe(true);
    expect(productMatchesPriceConstraints({ pricing: { aed: 68, sar: 68 } }, floorAed)).toBe(false);
  });

  it("enforces cap (max price in corridor)", () => {
    const cap = parsePriceConstraints("under 90 AED vase");
    expect(productMatchesPriceConstraints({ pricing: { aed: 89 } }, cap)).toBe(true);
    expect(productMatchesPriceConstraints({ pricing: { aed: 120 } }, cap)).toBe(false);
  });

  it("applies range on min corridor price when currency is any", () => {
    const r = parsePriceConstraints("between 50 and 100");
    expect(r.rangeMin).toBe(50);
    expect(r.rangeMax).toBe(100);
    expect(productMatchesPriceConstraints({ pricing: { aed: 75, sar: 80 } }, r)).toBe(true);
    expect(productMatchesPriceConstraints({ pricing: { aed: 30, sar: 30 } }, r)).toBe(false);
  });
});
