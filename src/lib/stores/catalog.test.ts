import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CATALOG } from "./catalog";
import { STORES } from "./readers";

const manifest = JSON.parse(readFileSync(new URL("../../../public/manifest.json", import.meta.url), "utf8")) as {
  optional_host_permissions: string[];
};

describe("shop catalog", () => {
  it("has unique ids and https order pages", () => {
    const ids = CATALOG.map((c) => c.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const shop of CATALOG) expect(shop.ordersUrl).toMatch(/^https:\/\//);
  });

  it("declares every origin it will ask for in the manifest", () => {
    const declared = new Set(manifest.optional_host_permissions);
    for (const origin of [...CATALOG, ...STORES].flatMap((s) => s.origins)) expect(declared.has(origin)).toBe(true);
  });

  it("only opens order pages on origins it has asked for", () => {
    for (const shop of CATALOG) {
      const host = new URL(shop.ordersUrl).origin;
      expect(shop.origins.some((o) => o.startsWith(host))).toBe(true);
    }
  });
});
