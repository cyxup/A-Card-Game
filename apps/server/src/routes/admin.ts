import type { FastifyInstance } from "fastify";
import { desc, eq, inArray } from "drizzle-orm";
import { z } from "zod";
import type { AdminReportView, AdminRoomView, AdminUserDetail, MatchHistoryItem } from "@stacked/shared";
import { db } from "../db/index.js";
import { matches, matchPlayers, reports, sessions, userChatPacks, userCosmetics, users } from "../db/schema.js";
import { badRequest, requireOwner } from "../lib/http.js";
import { disconnectUser, refreshUserConnections } from "../realtime.js";
import { rooms } from "../rooms/manager.js";
import {
  AdminError,
  banUser,
  grantUser,
  listAudit,
  listUsers,
  recordAdminAudit,
  setBeta,
  toAdminUser,
  unbanUser,
} from "../services/admin.js";

const banSchema = z.object({ reason: z.string().max(240).optional() });
const betaSchema = z.object({ beta: z.boolean() });
const grantSchema = z.object({
  coins: z.number().int().min(0).max(1_000_000).optional(),
  xp: z.number().int().min(0).max(1_000_000).optional(),
  unlockAll: z.boolean().optional(),
});
const kickSchema = z.object({ reason: z.string().max(240).optional() });
const freezeSchema = z.object({ frozen: z.boolean() });
const broadcastSchema = z.object({ message: z.string().trim().min(1).max(240) });
const reportStatusSchema = z.object({ status: z.enum(["resolved", "dismissed"]) });

function targetId(request: { params: unknown }): string {
  return String((request.params as { id?: string }).id ?? "");
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/users", async (request) => {
    requireOwner(request);
    const query = String((request.query as { q?: string })?.q ?? "");
    return listUsers(query);
  });

  app.get("/api/admin/rooms", async (request): Promise<AdminRoomView[]> => {
    requireOwner(request);
    return rooms.adminRooms();
  });

  app.post("/api/admin/rooms/:code/lobby", async (request) => {
    const actor = requireOwner(request);
    const code = String((request.params as { code?: string }).code ?? "").toUpperCase();
    rooms.adminReturnToLobby(code);
    await recordAdminAudit(actor.user, "room_lobby", { code });
    return { ok: true };
  });

  app.post("/api/admin/rooms/:code/close", async (request) => {
    const actor = requireOwner(request);
    const code = String((request.params as { code?: string }).code ?? "").toUpperCase();
    rooms.adminCloseRoom(code);
    await recordAdminAudit(actor.user, "room_close", { code });
    return { ok: true };
  });

  app.post("/api/admin/rooms/:code/freeze", async (request) => {
    const actor = requireOwner(request);
    const parsed = freezeSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick a freeze state.");
    const code = String((request.params as { code?: string }).code ?? "").toUpperCase();
    rooms.adminFreeze(code, parsed.data.frozen);
    await recordAdminAudit(actor.user, "room_freeze", { code, frozen: parsed.data.frozen });
    return { ok: true };
  });

  app.post("/api/admin/broadcast", async (request) => {
    const actor = requireOwner(request);
    const parsed = broadcastSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Write a message first.");
    rooms.adminBroadcast(parsed.data.message);
    await recordAdminAudit(actor.user, "broadcast", { message: parsed.data.message });
    return { ok: true };
  });

  app.get("/api/admin/reports", async (request): Promise<AdminReportView[]> => {
    requireOwner(request);
    const rows = await db.select().from(reports).orderBy(desc(reports.createdAt)).limit(100);
    const ids = [...new Set(rows.flatMap((row) => [row.reporterId, row.targetId]))];
    const names = ids.length
      ? await db.select({ id: users.id, name: users.username }).from(users).where(inArray(users.id, ids))
      : [];
    const byId = new Map(names.map((row) => [row.id, row.name]));
    return rows.map((row) => ({
      id: row.id,
      reporterName: byId.get(row.reporterId) ?? "?",
      targetName: byId.get(row.targetId) ?? "?",
      reason: row.reason,
      status: row.status as AdminReportView["status"],
      createdAt: row.createdAt.getTime(),
    }));
  });

  app.post("/api/admin/reports/:id/status", async (request) => {
    const actor = requireOwner(request);
    const parsed = reportStatusSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick a report status.");
    const id = String((request.params as { id?: string }).id ?? "");
    await db
      .update(reports)
      .set({ status: parsed.data.status, resolvedAt: new Date() })
      .where(eq(reports.id, id));
    await recordAdminAudit(actor.user, "report_status", { reportId: id, status: parsed.data.status });
    return { ok: true };
  });

  app.get("/api/admin/users/:id", async (request): Promise<AdminUserDetail> => {
    requireOwner(request);
    const id = targetId(request);
    const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (!row) throw new AdminError("not_found", "That account does not exist.", 404);
    const [sessionRows, matchRows, cosmetics, packs] = await Promise.all([
      db.select({ id: sessions.id }).from(sessions).where(eq(sessions.userId, id)),
      db
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
        .where(eq(matchPlayers.userId, id))
        .orderBy(desc(matches.endedAt))
        .limit(8),
      db.select({ itemId: userCosmetics.itemId }).from(userCosmetics).where(eq(userCosmetics.userId, id)),
      db.select({ packId: userChatPacks.packId }).from(userChatPacks).where(eq(userChatPacks.userId, id)),
    ]);
    const recentMatches: MatchHistoryItem[] = matchRows.map((match) => ({
      ...match,
      endedAt: match.endedAt.getTime(),
    }));
    return {
      ...toAdminUser(row),
      sessions: sessionRows.length,
      recentMatches,
      ownedCosmetics: cosmetics.map((item) => item.itemId),
      chatPacks: packs.map((pack) => pack.packId),
    };
  });

  app.post("/api/admin/users/:id/logout", async (request) => {
    const actor = requireOwner(request);
    const id = targetId(request);
    await db.delete(sessions).where(eq(sessions.userId, id));
    disconnectUser(id, "Signed out by the owner.");
    await recordAdminAudit(actor.user, "user_logout", { userId: id });
    return { ok: true };
  });

  app.get("/api/admin/audit", async (request) => {
    requireOwner(request);
    return listAudit();
  });

  app.post("/api/admin/users/:id/ban", async (request) => {
    const principal = requireOwner(request);
    const parsed = banSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Enter a ban reason.");
    const user = await banUser(principal.user, targetId(request), parsed.data?.reason ?? "");
    rooms.kickPlayer(user.id, "This account has been banned by the owner.");
    return user;
  });

  app.post("/api/admin/users/:id/unban", async (request) => {
    const principal = requireOwner(request);
    return unbanUser(principal.user, targetId(request));
  });

  app.post("/api/admin/users/:id/beta", async (request) => {
    const principal = requireOwner(request);
    const parsed = betaSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick beta access state.");
    const id = targetId(request);
    const updated = await setBeta(principal.user, id, parsed.data?.beta ?? false);
    const [fresh] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    if (fresh) {
      refreshUserConnections(fresh);
      rooms.refreshUser(fresh);
    }
    return updated;
  });

  app.post("/api/admin/users/:id/grant", async (request) => {
    const principal = requireOwner(request);
    const parsed = grantSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick a cheat value.");
    return grantUser(principal.user, targetId(request), parsed.data ?? {});
  });

  app.post("/api/admin/users/:id/kick", async (request) => {
    requireOwner(request);
    const parsed = kickSchema.safeParse(request.body ?? {});
    const reason = parsed.success ? parsed.data.reason : undefined;
    rooms.kickPlayer(targetId(request), reason || "You were removed by the owner.");
    return { ok: true };
  });

  app.post("/api/admin/cheat", async (request) => {
    const principal = requireOwner(request);
    const parsed = grantSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick a cheat value.");
    return grantUser(principal.user, principal.user.id, parsed.data ?? {});
  });
}
