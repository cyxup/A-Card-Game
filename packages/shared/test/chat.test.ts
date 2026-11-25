import { describe, expect, it } from "vitest";
import {
  CHAT_LINES_BY_ID,
  CHAT_PACKS,
  CHAT_PACKS_BY_ID,
  DEFAULT_CHAT_PACK_ID,
  chatPackVisible,
} from "../src/index.js";

describe("quick chat catalogue", () => {
  it("has unique pack and line ids", () => {
    const packIds = CHAT_PACKS.map((pack) => pack.id);
    expect(new Set(packIds).size).toBe(packIds.length);
    expect(CHAT_PACKS_BY_ID.size).toBe(CHAT_PACKS.length);

    const lines = CHAT_PACKS.flatMap((pack) => pack.lines);
    expect(CHAT_LINES_BY_ID.size).toBe(lines.length);
    expect(new Set(lines.map((line) => line.id)).size).toBe(lines.length);
  });

  it("ships plenty of usable packs", () => {
    expect(CHAT_PACKS.length).toBeGreaterThanOrEqual(8);
    expect(CHAT_PACKS_BY_ID.get(DEFAULT_CHAT_PACK_ID)?.unlock.type).toBe("default");
    for (const pack of CHAT_PACKS) {
      expect(pack.lines.length).toBeGreaterThanOrEqual(6);
      for (const line of pack.lines) {
        expect(line.packId).toBe(pack.id);
        expect(line.text.trim().length).toBeGreaterThan(0);
      }
    }
  });

  it("prices every shop pack", () => {
    for (const pack of CHAT_PACKS) {
      if (pack.unlock.type === "shop") expect(pack.unlock.price).toBeGreaterThan(0);
    }
  });

  it("keeps owner and beta packs hidden from the wrong accounts", () => {
    const house = CHAT_PACKS_BY_ID.get("house");
    const beta = CHAT_PACKS_BY_ID.get("beta-lab");
    const essentials = CHAT_PACKS_BY_ID.get("essentials");
    expect(house && beta && essentials).toBeTruthy();
    expect(chatPackVisible(house!, { owner: false, beta: false })).toBe(false);
    expect(chatPackVisible(house!, { owner: true, beta: false })).toBe(true);
    expect(chatPackVisible(beta!, { owner: false, beta: true })).toBe(true);
    expect(chatPackVisible(beta!, { owner: false, beta: false })).toBe(false);
    expect(chatPackVisible(essentials!, { owner: false, beta: false })).toBe(true);
  });
});
