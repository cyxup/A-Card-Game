import {
  COSMETICS,
  levelForXp,
  type AdminAuditView,
  type AdminGrantInput,
  type AdminUserView,
} from "@stacked/shared";
import { desc, eq, ilike, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { adminAudit, sessions, userCosmetics, users, type UserRow } from "../db/schema.js";
import { syncUnlocks } from "./account.js";

export class AdminError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function toAdminUser(user: UserRow): AdminUserView {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    level: levelForXp(user.xp),
    xp: user.xp,
    coins: user.coins,
    games: user.games,
    wins: user.wins,
    owner: user.isOwner,
    banned: user.banned,
    banReason: user.banReason ?? null,
    createdAt: user.createdAt.getTime(),
  };
}

export async function listUsers(query: string, limit = 80): Promise<AdminUserView[]> {
  const term = query.trim();
  const rows = term
    ? await db
        .select()
        .from(users)
        .where(
          or(
            ilike(users.username, `%${term}%`),
            ilike(users.displayName, `%${term}%`),
          ),
        )
        .orderBy(desc(users.createdAt))
        .limit(limit)
    : await db.select().from(users).orderBy(desc(users.createdAt)).limit(limit);
  return rows.map(toAdminUser);
}

async function audit(
  actor: UserRow,
  action: string,
  target: UserRow | null,
  detail: Record<string, unknown> | null = null,
): Promise<void> {
  await db.insert(adminAudit).values({
    actorId: actor.id,
    actorName: actor.username,
    action,
    targetId: target?.id ?? null,
    targetName: target?.username ?? null,
    detail,
  });
}

async function targetRow(targetId: string): Promise<UserRow> {
  const [user] = await db.select().from(users).where(eq(users.id, targetId)).limit(1);
  if (!user) throw new AdminError("not_found", "That account does not exist.", 404);
  return user;
}

export async function banUser(
  actor: UserRow,
  targetId: string,
  reason: string,
): Promise<AdminUserView> {
  if (targetId === actor.id) throw new AdminError("cannot_ban_self", "You cannot ban yourself.");
  const target = await targetRow(targetId);
  if (target.isOwner && target.id !== actor.id) {
    throw new AdminError("cannot_ban_owner", "Remove the owner flag first.");
  }
  const cleanReason = reason.trim().slice(0, 240) || "Banned by the house.";
  const [fresh] = await db
    .update(users)
    .set({
      banned: true,
      banReason: cleanReason,
      bannedAt: new Date(),
      bannedBy: actor.username,
    })
    .where(eq(users.id, target.id))
    .returning();
  if (!fresh) throw new AdminError("not_found", "That account does not exist.", 404);
  await db.delete(sessions).where(eq(sessions.userId, target.id));
  await audit(actor, "ban", target, { reason: cleanReason });
  return toAdminUser(fresh);
}

export async function unbanUser(actor: UserRow, targetId: string): Promise<AdminUserView> {
  const target = await targetRow(targetId);
  const [fresh] = await db
    .update(users)
    .set({ banned: false, banReason: null, bannedAt: null, bannedBy: null })
    .where(eq(users.id, target.id))
    .returning();
  if (!fresh) throw new AdminError("not_found", "That account does not exist.", 404);
  await audit(actor, "unban", target);
  return toAdminUser(fresh);
}

export async function setOwner(
  actor: UserRow,
  targetId: string,
  owner: boolean,
): Promise<AdminUserView> {
  if (targetId === actor.id) {
    throw new AdminError("cannot_change_own_owner", "You cannot change your own owner flag here.");
  }
  const target = await targetRow(targetId);
  const [fresh] = await db
    .update(users)
    .set({ isOwner: owner })
    .where(eq(users.id, target.id))
    .returning();
  if (!fresh) throw new AdminError("not_found", "That account does not exist.", 404);
  await syncUnlocks(fresh);
  await audit(actor, owner ? "owner_grant" : "owner_revoke", target);
  return toAdminUser(fresh);
}

export async function grantUser(
  actor: UserRow,
  targetId: string,
  input: AdminGrantInput,
): Promise<AdminUserView> {
  const target = await targetRow(targetId);
  const coins = Math.max(0, Math.min(1_000_000, Math.round(Number(input.coins) || 0)));
  const xp = Math.max(0, Math.min(1_000_000, Math.round(Number(input.xp) || 0)));
  const unlockAll = Boolean(input.unlockAll);
  if (coins === 0 && xp === 0 && !unlockAll) {
    throw new AdminError("nothing_to_grant", "Pick at least one cheat.");
  }

  if (coins > 0 || xp > 0) {
    await db
      .update(users)
      .set({
        coins: sql`${users.coins} + ${coins}`,
        xp: sql`${users.xp} + ${xp}`,
      })
      .where(eq(users.id, target.id));
  }

  if (unlockAll) {
    const [current] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
    if (!current) throw new AdminError("not_found", "That account does not exist.", 404);
    const visible = COSMETICS.filter((item) => item.unlock.type !== "owner" || current.isOwner);
    if (visible.length > 0) {
      await db
        .insert(userCosmetics)
        .values(
          visible.map((item) => ({
            userId: current.id,
            itemId: item.id,
            source: "admin",
          })),
        )
        .onConflictDoNothing();
    }
    await syncUnlocks(current);
  }

  const [fresh] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
  if (!fresh) throw new AdminError("not_found", "That account does not exist.", 404);
  await audit(actor, "grant", target, { coins, xp, unlockAll });
  return toAdminUser(fresh);
}

export async function listAudit(limit = 60): Promise<AdminAuditView[]> {
  const rows = await db
    .select()
    .from(adminAudit)
    .orderBy(desc(adminAudit.createdAt))
    .limit(limit);
  return rows.map((row) => ({
    id: row.id,
    actorName: row.actorName,
    action: row.action,
    targetName: row.targetName ?? null,
    detail: row.detail ?? null,
    createdAt: row.createdAt.getTime(),
  }));
}
