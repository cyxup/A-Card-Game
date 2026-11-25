import type { PublicStats } from "@stacked/shared";
import { count } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/index.js";
import { matches, users } from "../db/schema.js";
import { ApiError, badRequest, requireUser } from "../lib/http.js";
import { rooms } from "../rooms/manager.js";
import {
  equipItem,
  leaderboard,
  profilePayload,
  purchaseItem,
  sessionInfo,
  updateDisplayName,
} from "../services/account.js";

const itemSchema = z.object({ itemId: z.string().min(1).max(40) });
const nameSchema = z.object({ displayName: z.string().min(1).max(40) });

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

export async function accountRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/me/profile", async (request) => {
    const principal = requireUser(request);
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
    return result.profile;
  });

  app.patch("/api/me", async (request) => {
    const principal = requireUser(request);
    const parsed = nameSchema.safeParse(request.body);
    if (!parsed.success) throw new ApiError(400, "invalid_name", "Use 2–20 characters.");
    const fresh = await updateDisplayName(principal.user, parsed.data.displayName);
    return sessionInfo({ kind: "user", sessionId: principal.sessionId, user: fresh });
  });

  app.get("/api/leaderboard", async () => leaderboard(50));

  app.get("/api/rooms", async () => rooms.listPublic());

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
