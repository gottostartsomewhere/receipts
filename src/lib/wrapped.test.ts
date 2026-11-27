import { describe, expect, it } from "vitest";
import { undash } from "./wrapped";

describe("undash", () => {
  it("turns long dashes from the model into commas, everywhere in the Wrapped", () => {
    const w = undash({ roast: "You paid ₹10,200 in fees—totally daylight robbery.", cards: [{ line: "A year – well spent" }], n: 3 });
    expect(w.roast).toBe("You paid ₹10,200 in fees, totally daylight robbery.");
    expect(w.cards[0].line).toBe("A year, well spent");
    expect(w.n).toBe(3);
  });

  it("leaves hyphens alone", () => {
    expect(undash("late-night orders")).toBe("late-night orders");
  });
});
