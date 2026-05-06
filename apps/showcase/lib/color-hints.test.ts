import { describe, expect, it } from "vitest";

import { colorHints } from "./csv-demo-search";

describe("colorHints word boundaries", () => {
  it("does not treat blackout as black colour intent", () => {
    expect(colorHints("2-pack blackout curtains under 300")).toEqual([]);
  });

  it("extracts blue and black from conversational NL", () => {
    expect(colorHints("winter wear for men i need blue and black")).toEqual(expect.arrayContaining(["blue", "black"]));
  });
});
