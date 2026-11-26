import type { DailyChallengeView, MatchHistoryDetail, MatchHistoryItem, PublicStats } from "@stacked/shared";
import { DAILY_CHALLENGES } from "@stacked/shared";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyPassword } from "../auth/password.js";
import { generateRecoveryCode, hashRecoveryCode } from "../auth/recovery.js";
import { db } from "../db/index.js";
import { dailyClaims, matches, matchPlayers, reports, users } from "../db/schema.js";
import { ApiError, badRequest, requireUser } from "../lib/http.js";
import { rateLimit } from "../lib/rate-limit.js";
import { refreshUserConnections } from "../realtime.js";
import { rooms } from "../rooms/manager.js";
import {
  equipItem,
  leaderboard,
  profilePayload,
  purchaseItem,
  sessionInfo,
  updateDisplayName,
} from "../services/account.js";
import { purchaseChatPack } from "../services/chat.js";

const itemSchema = z.object({ itemId: z.string().min(1).max(40) });
const chatPackSchema = z.object({ packId: z.string().min(1).max(40) });
const nameSchema = z.object({ displayName: z.string().min(1).max(40) });
const recoverySchema = z.object({ password: z.string().min(1).max(200) });

let totalsCache: { at: number; players: number; matches: number } = { at: 0, players: 0, matches: 0 };

async function totals(): Promise<{ players: number; matches: number }> {
  if (Date.now() - totalsCache.at < 30_000) return totalsCache;
  const [[playerRow], [matchRow]] = await Promise.all([
    db.select({ value: count() }).from(users),
    db.select({ value: count() }).from(matches),
  ]);
  totalsCache = { at: Date.now(), players: Number(playerRow?.value ?? 0), matches: Number(matchRow?.value ?? 0) };
  return totalsCache;
}

function utcDay(): { key: string; start: Date } {
  const now = new Date();
  const key = now.toISOString().slice(0, 10);
  return { key, start: new Date(`${key}T00:00:00.000Z`) };
}

function challengeProgress(id: string, rows: { placement: number }[]): number {
  switch (id) {
    case "play-3":
      return rows.length;
    case "win-1":
      return rows.filter((row) => row.placement === 1).length;
    case "top2-2":
      return rows.filter((row) => row.placement <= 2).length;
    default:
      return 0;
  }
}

async function dailyChallengeViews(userId: string): Promise<DailyChallengeView[]> {
  const { key, start } = utcDay();
  const [results, claims] = await Promise.all([
    db
      .select({ placement: matchPlayers.placement })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(and(eq(matchPlayers.userId, userId), gte(matches.endedAt, start))),
    db
      .select({ challengeId: dailyClaims.challengeId })
      .from(dailyClaims)
      .where(and(eq(dailyClaims.userId, userId), eq(dailyClaims.day, key))),
  ]);
  const claimed = new Set(claims.map((claim) => claim.challengeId));
  return DAILY_CHALLENGES.map((challenge) => ({
    ...challenge,
    progress: Math.min(challenge.target, challengeProgress(challenge.id, results)),
    claimed: claimed.has(challenge.id),
  }));
}

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/me/profile", async (request) => {
    const principal = requireUser(request);
    if (!rateLimit(`profile:${request.ip}`, 300, 60_000).ok) {
      throw new ApiError(429, "rate_limited", "Slow down a little.");
    }
    return profilePayload(principal.user);
  });

  app.post("/api/me/cosmetics/buy", async (request) => {
    const principal = requireUser(request);
    const parsed = itemSchema.safeParse(request.body);
    if (!parsed.success) badRequest("Pick an item.");
    const result = await purchaseItem(principal.user, parsed.data.itemId);
    return result.profile;
  });

  app.post("/api/me/cosmetics/equip", async (request) => {
    const principal = requireUser(request);
    const parsed = itemSchema.safeParse(request.body);
    if (!parsed.success) badRequest("Pick an item.");
    const result = await equipItem(principal.user, parsed.data.itemId);
    refreshUserConnections(result.user);
    rooms.refreshUser(result.user);
    return result.profile;
  });

  app.post("/api/me/chat/buy", async (request) => {
    const principal = requireUser(request);
    const parsed = chatPackSchema.safeParse(request.body);
    if (!parsed.success) badRequest("Pick a quick-chat pack.");
    if (!rateLimit(`chat-buy:${request.ip}`, 30, 60_000).ok) {
      throw new ApiError(429, "rate_limited", "Slow down a little.");
    }
    const fresh = await purchaseChatPack(principal.user, parsed.data.packId);
    return profilePayload(fresh);
  });

  app.patch("/api/me", async (request) => {
    const principal = requireUser(request);
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, "invalid_name", "Use 2–20 characters.");
    const fresh = await updateDisplayName(principal.user, parsed.data.displayName);
    refreshUserConnections(fresh);
    rooms.refreshUser(fresh);
    return sessionInfo({ kind: "user", sessionId: principal.sessionId, user: fresh });
  });

  app.get("/api/leaderboard", async () => leaderboard(50));

  app.get("/api/me/challenges", async (request) => {
    const principal = requireUser(request);
    return dailyChallengeViews(principal.user.id);
  });

  app.post("/api/me/challenges/:id/claim", async (request) => {
    const principal = requireUser(request);
    if (!rateLimit(`challenge-claim:${request.ip}`, 30, 60_000).ok) {
      throw new ApiError(429, "rate_limited", "Slow down a little.");
    }
    const id = String((request.params as { id?: string }).id ?? "");
    const challenge = DAILY_CHALLENGES.find((entry) => entry.id === id);
    if (!challenge) throw new ApiError(404, "not_found", "That challenge does not exist.");
    const views = await dailyChallengeViews(principal.user.id);
    const view = views.find((entry) => entry.id === id);
    if (!view || view.progress < challenge.target) {
      throw new ApiError(400, "challenge_not_complete", "Finish this challenge first.");
    }
    if (view.claimed) throw new ApiError(409, "already_claimed", "You already claimed this one.");
    const { key } = utcDay();
    await db.transaction(async (tx) => {
      const [claim] = await tx
        .insert(dailyClaims)
        .values({
          userId: principal.user.id,
          day: key,
          challengeId: challenge.id,
          reward: challenge.reward,
        })
        .onConflictDoNothing()
        .returning({ id: dailyClaims.id });
      if (!claim) throw new ApiError(409, "already_claimed", "You already claimed this one.");
      await tx
        .update(users)
        .set({ coins: sql`${users.coins} + ${challenge.reward}` })
        .where(eq(users.id, principal.user.id));
    });
    return { reward: challenge.reward, challenges: await dailyChallengeViews(principal.user.id) };
  });

  app.post("/api/reports", async (request) => {
    const principal = requireUser(request);
    if (!rateLimit(`report:${request.ip}`, 10, 10 * 60_000).ok) {
      throw new ApiError(429, "rate_limited", "Too many reports. Try again later.");
    }
    const parsed = z
      .object({ userId: z.string().uuid(), reason: z.string().trim().min(5).max(240) })
      .safeParse(request.body ?? {});
    if (!parsed.success) throw new ApiError(400, "invalid_input", "Describe the problem in a few words.");
    if (parsed.data.userId === principal.user.id) {
      throw new ApiError(400, "invalid_target", "You cannot report yourself.");
    }
    const [target] = await db.select({ id: users.id }).from(users).where(eq(users.id, parsed.data.userId)).limit(1);
    if (!target) throw new ApiError(404, "not_found", "That player does not exist.");
    await db.insert(reports).values({
      reporterId: principal.user.id,
      targetId: target.id,
      reason: parsed.data.reason,
    });
    return { ok: true };
  });

  app.get("/api/me/matches", async (request) => {
    const principal = requireUser(request);
    if (!rateLimit(`history:${request.ip}`, 120, 60_000).ok) {
      throw new ApiError(429, "rate_limited", "Slow down a little.");
    }
    const rows = await db
      .select({
        id: matches.id,
        roomCode: matches.roomCode,
        playerCount: matches.playerCount,
        winnerName: matches.winnerName,
        endedAt: matches.endedAt,
        durationSeconds: matches.durationSeconds,
        placement: matchPlayers.placement,
        cardsLeft: matchPlayers.cardsLeft,
        coins: matchPlayers.coins,
        xp: matchPlayers.xp,
      })
      .from(matchPlayers)
      .innerJoin(matches, eq(matchPlayers.matchId, matches.id))
      .where(eq(matchPlayers.userId, principal.user.id))
      .orderBy(desc(matches.endedAt))
      .limit(40);
    const items: MatchHistoryItem[] = rows.map((row) => ({
      id: row.id,
      roomCode: row.roomCode,
      playerCount: row.playerCount,
      winnerName: row.winnerName,
      endedAt: row.endedAt.getTime(),
      durationSeconds: row.durationSeconds,
      placement: row.placement,
      cardsLeft: row.cardsLeft,
      coins: row.coins,
      xp: row.xp,
    }));
    return items;
  });

  app.get("/api/me/matches/:id", async (request) => {
    const principal = requireUser(request);
    const parsed = z.string().uuid().safeParse((request.params as { id?: string })?.id);
    if (!parsed.success) throw new ApiError(404, "not_found", "That match does not exist.");
    const [match] = await db.select().from(matches).where(eq(matches.id, parsed.data)).limit(1);
    if (!match) throw new ApiError(404, "not_found", "That match does not exist.");
    const players = await db.select().from(matchPlayers).where(eq(matchPlayers.matchId, match.id));
    const mine = players.find((player) => player.userId === principal.user.id);
    if (!mine) throw new ApiError(403, "forbidden", "You were not at that table.");
    const detail: MatchHistoryDetail = {
      id: match.id,
      roomCode: match.roomCode,
      playerCount: match.playerCount,
      winnerName: match.winnerName,
      endedAt: match.endedAt.getTime(),
      durationSeconds: match.durationSeconds,
      placement: mine.placement,
      cardsLeft: mine.cardsLeft,
      coins: mine.coins,
      xp: mine.xp,
      rules: match.rules,
      log: match.log ?? [],
      players: players
        .map((player) => ({
          id: player.seatId ?? "",
          displayName: player.displayName,
          isBot: player.isBot,
          placement: player.placement,
          cardsLeft: player.cardsLeft,
          coins: player.coins,
          xp: player.xp,
        }))
        .sort((a, b) => a.placement - b.placement),
    };
    return detail;
  });

  app.get("/api/rooms", async () => rooms.listPublic());

  app.post("/api/me/recovery", async (request) => {
    const principal = requireUser(request);
    const parsed = recoverySchema.safeParse(request.body);
    if (!parsed.success) badRequest("Enter your current password.");

    const valid = await verifyPassword(parsed.data.password, principal.user.passwordHash);
    if (!valid) throw new ApiError(401, "invalid_password", "That password is not right.");

    const recoveryCode = generateRecoveryCode();
    await db
      .update(users)
      .set({ recoveryHash: hashRecoveryCode(recoveryCode), recoveryIssuedAt: new Date() })
      .where(eq(users.id, principal.user.id));
    return { recoveryCode };
  });

  app.get("/api/stats", async () => {
    const base = await totals();
    const payload: PublicStats = {
      players: base.players,
      matches: base.matches,
      online: rooms.onlineCount(),
      rooms: rooms.roomCount(),
    };
    return payload;
  });
}
