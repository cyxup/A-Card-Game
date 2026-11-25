import { describe, expect, it } from "vitest";
import { matchRewardsForHumans, roundIsRanked } from "../src/index.js";

describe("ranked rounds", () => {
  it("requires at least two humans at the table", () => {
    expect(roundIsRanked(0)).toBe(false);
    expect(roundIsRanked(1)).toBe(false);
    expect(roundIsRanked(2)).toBe(true);
    expect(roundIsRanked(8)).toBe(true);
  });

  it("pays nothing against bots only, even for a win", () => {
    expect(
      matchRewardsForHumans({
        placement: 1,
        humanPlayers: 1,
        opponentCardsLeft: 20,
        cardsPlayed: 40,
        jumps: 8,
      }),
    ).toEqual({ coins: 0, xp: 0 });
  });

  it("pays a human winner when another human is seated", () => {
    const rewards = matchRewardsForHumans({
      placement: 1,
      humanPlayers: 2,
      opponentCardsLeft: 0,
      cardsPlayed: 20,
      jumps: 2,
    });
    expect(rewards).toEqual({ coins: 130, xp: 105 });
  });

  it("still pays a human who loses to another human", () => {
    const rewards = matchRewardsForHumans({
      placement: 2,
      humanPlayers: 2,
      opponentCardsLeft: 0,
      cardsPlayed: 10,
      jumps: 1,
    });
    expect(rewards.coins).toBeGreaterThan(0);
    expect(rewards.xp).toBeGreaterThan(0);
  });
});
