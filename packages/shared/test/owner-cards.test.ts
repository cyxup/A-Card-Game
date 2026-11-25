import { describe, expect, it } from "vitest";
import { isValidOwnerCardSpec, ownerCardFromSpec } from "../src/index.js";

describe("owner card editor", () => {
  it("accepts legal number and action cards", () => {
    expect(isValidOwnerCardSpec({ color: "red", kind: "number", value: 7 })).toBe(true);
    expect(isValidOwnerCardSpec({ color: "blue", kind: "skip", value: null })).toBe(true);
    expect(isValidOwnerCardSpec({ color: "green", kind: "draw2" })).toBe(true);
    expect(isValidOwnerCardSpec({ color: null, kind: "wild4" })).toBe(true);
    expect(isValidOwnerCardSpec({ color: null, kind: "swap" })).toBe(true);
  });

  it("rejects malformed cards", () => {
    expect(isValidOwnerCardSpec({ color: null, kind: "number", value: 7 })).toBe(false);
    expect(isValidOwnerCardSpec({ color: "red", kind: "number", value: 10 })).toBe(false);
    expect(isValidOwnerCardSpec({ color: "red", kind: "number", value: 1.5 })).toBe(false);
    expect(isValidOwnerCardSpec({ color: "red", kind: "wild" })).toBe(false);
    expect(isValidOwnerCardSpec({ color: "purple" as never, kind: "skip" })).toBe(false);
    expect(isValidOwnerCardSpec({ color: "red", kind: "nope" as never })).toBe(false);
  });

  it("builds a card with a fresh id and normalised value", () => {
    const card = ownerCardFromSpec({ color: "yellow", kind: "number", value: 3 }, "owner-test");
    expect(card).toEqual({ id: "owner-test", color: "yellow", kind: "number", value: 3 });

    const wild = ownerCardFromSpec({ color: null, kind: "wild", value: 9 }, "owner-wild");
    expect(wild).toEqual({ id: "owner-wild", color: null, kind: "wild", value: null });
  });
});
