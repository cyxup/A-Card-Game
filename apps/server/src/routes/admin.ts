import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { badRequest, requireOwner } from "../lib/http.js";
import { rooms } from "../rooms/manager.js";
import {
  banUser,
  grantUser,
  listAudit,
  listUsers,
  setBeta,
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

function targetId(request: { params: unknown }): string {
  return String((request.params as { id?: string }).id ?? "");
}

export async function adminRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/admin/users", async (request) => {
    requireOwner(request);
    const query = String((request.query as { q?: string })?.q ?? "");
    return listUsers(query);
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
    return setBeta(principal.user, targetId(request), parsed.data?.beta ?? false);
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
