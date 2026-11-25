import { describe, expect, it } from "vitest";
import { ACHIEVEMENTS, COSMETICS, COSMETICS_BY_ID, DEFAULT_RULES, SLOT_FALLBACK, defaultLoadout } from "../src/index.js";

describe("cosmetics catalogue", () => {
  it("has globally unique ids", () => {
    const ids = COSMETICS.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(COSMETICS_BY_ID.size).toBe(COSMETICS.length);
  });

  it("has a default for every slot", () => {
    for (const id of Object.values(SLOT_FALLBACK)) {
      expect(COSMETICS_BY_ID.get(id)).toBeDefined();
    }
    expect(Object.values(defaultLoadout())).toHaveLength(5);
  });

  it("points achievement rewards at real cosmetics", () => {
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.reward) expect(COSMETICS_BY_ID.get(achievement.reward)).toBeDefined();
    }
  });

  it("has sensible shop prices", () => {
    for (const item of COSMETICS) {
      if (item.unlock.type === "shop") expect(item.unlock.price).toBeGreaterThan(0);
    }
  });
});

describe("default rules", () => {
  it("is playable out of the box", () => {
    expect(DEFAULT_RULES.stacking).toBe("same");
    expect(DEFAULT_RULES.jumpIn).toBe(true);
    expect(DEFAULT_RULES.maxPlayers).toBeGreaterThanOrEqual(2);
  });
});
