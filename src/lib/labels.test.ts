import { describe, expect, it } from "vitest";
import { parseLabelLine } from "./firebase";
import { ruleLabel } from "./labeler";

describe("parseLabelLine", () => {
  it("reads Nano's one-line format and maps short categories", () => {
    expect(parseLabelLine("3|face serum|beauty")).toEqual({ id: 3, label: "face serum", category: "beauty" });
    expect(parseLabelLine("12|biryani|food")).toEqual({ id: 12, label: "biryani", category: "food_delivery" });
    expect(parseLabelLine("7|power bank|tech")).toEqual({ id: 7, label: "power bank", category: "electronics" });
  });

  it("tolerates the cloud model's spacing and casing", () => {
    expect(parseLabelLine(" 4 | Running Shoes | Fashion ")).toEqual({ id: 4, label: "running shoes", category: "fashion" });
  });

  it("rejects anything that is not a well-formed line", () => {
    expect(parseLabelLine("")).toBeNull();
    expect(parseLabelLine("biryani|food")).toBeNull();
    expect(parseLabelLine("2|biryani|snacks and more")).toBeNull();
    expect(parseLabelLine("2|biryani|dessert")).toBeNull();
  });
});

describe("ruleLabel", () => {
  it("gives a usable label and category without any model", () => {
    expect(ruleLabel("Chicken Biryani (Full)")).toMatchObject({ category: "food_delivery", source: "rules" });
    expect(ruleLabel("Logitech M331 Silent Plus Wireless Mouse").category).toBe("electronics");
  });
});
