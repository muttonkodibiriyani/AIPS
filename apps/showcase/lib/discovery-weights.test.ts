import { describe, expect, it } from "vitest";

import { discoveryWeightsFromBody } from "./discovery-weights";

describe("discoveryWeightsFromBody", () => {
  it("defaults to contextual-heavy weights", () => {
    const w = discoveryWeightsFromBody({});
    expect(w.lexicalWeight).toBe(0.18);
    expect(w.semanticWeight).toBe(0.82);
  });

  it("reads client context when both numbers are finite", () => {
    const w = discoveryWeightsFromBody({
      context: { lexicalWeight: 0.4, semanticWeight: 0.6, market: "AE" },
    });
    expect(w).toEqual({ lexicalWeight: 0.4, semanticWeight: 0.6 });
  });

  it("clamps weights to [0, 1]", () => {
    const w = discoveryWeightsFromBody({ context: { lexicalWeight: -1, semanticWeight: 99 } });
    expect(w.lexicalWeight).toBe(0);
    expect(w.semanticWeight).toBe(1);
  });
});
