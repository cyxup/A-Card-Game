import {
  COSMETICS,
  levelForXp,
  type AdminAuditView,
  type AdminGrantInput,
  type AdminTagView,
  type AdminUserView,
} from "@stacked/shared";
import { desc, eq, ilike, inArray, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  adminAudit,
  sessions,
  tags,
  userCosmetics,
  userTags,
  users,
  type UserRow,
} from "../db/schema.js";
import { syncUnlocks } from "./account.js";
import { grantAllChatPacks } from "./chat.js";

export class AdminError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function toAdminUser(user: UserRow, userTagList: AdminTagView[] = []): AdminUserView {
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
    beta: user.isBetaTester,
    banned: user.banned,
    banReason: user.banReason ?? null,
    createdAt: user.createdAt.getTime(),
    tags: userTagList,
  };
}

async function tagsByUser(ids: string[]): Promise<Map<string, AdminTagView[]>> {
  const unique = [...new Set(ids)];
  const result = new Map<string, AdminTagView[]>();
  if (unique.length === 0) return result;
  const rows = await db
    .select({
      userId: userTags.userId,
      id: tags.id,
      name: tags.name,
      color: tags.color,
    })
    .from(userTags)
    .innerJoin(tags, eq(userTags.tagId, tags.id))
    .where(inArray(userTags.userId, unique))
    .orderBy(tags.name);
  for (const row of rows) {
    const list = result.get(row.userId) ?? [];
    list.push({ id: row.id, name: row.name, color: row.color });
    result.set(row.userId, list);
  }
  return result;
}

export async function toAdminUserWithTags(user: UserRow): Promise<AdminUserView> {
  const byUser = await tagsByUser([user.id]);
  return toAdminUser(user, byUser.get(user.id) ?? []);
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
  const byUser = await tagsByUser(rows.map((row) => row.id));
  return rows.map((row) => toAdminUser(row, byUser.get(row.id) ?? []));
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

export async function recordAdminAudit(
  actor: UserRow,
  action: string,
  detail: Record<string, unknown> | null = null,
): Promise<void> {
  await audit(actor, action, null, detail);
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
  return toAdminUserWithTags(fresh);
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
  return toAdminUserWithTags(fresh);
}

export async function setBeta(
  actor: UserRow,
  targetId: string,
  beta: boolean,
): Promise<AdminUserView> {
  if (targetId === actor.id) {
    throw new AdminError("cannot_change_own_beta", "You cannot change your own beta flag here.");
  }
  const target = await targetRow(targetId);
  const [fresh] = await db
    .update(users)
    .set({ isBetaTester: beta })
    .where(eq(users.id, target.id))
    .returning();
  if (!fresh) throw new AdminError("not_found", "That account does not exist.", 404);
  await syncUnlocks(fresh);
  await audit(actor, beta ? "beta_grant" : "beta_revoke", target);
  return toAdminUserWithTags(fresh);
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
    const visible = COSMETICS.filter(
      (item) =>
        (item.unlock.type !== "owner" || current.isOwner) &&
        (item.unlock.type !== "beta" || current.isBetaTester || current.isOwner),
    );
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
    await grantAllChatPacks(current.id);
  }

  const [fresh] = await db.select().from(users).where(eq(users.id, target.id)).limit(1);
  if (!fresh) throw new AdminError("not_found", "That account does not exist.", 404);
  await audit(actor, "grant", target, { coins, xp, unlockAll });
  return toAdminUserWithTags(fresh);
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

export async function listTags(): Promise<AdminTagView[]> {
  const rows = await db.select().from(tags).orderBy(tags.name);
  return rows.map((row) => ({ id: row.id, name: row.name, color: row.color }));
}

export async function createTag(
  actor: UserRow,
  input: { name: string; color: string },
): Promise<AdminTagView> {
  const name = String(input.name ?? "").trim().slice(0, 20);
  const color = String(input.color ?? "").trim().toLowerCase();
  if (!name) throw new AdminError("tag_name_required", "Give the tag a name.");
  if (!/^#[0-9a-f]{6}$/.test(color)) {
    throw new AdminError("tag_color_invalid", "Pick a valid hex colour.");
  }
  const [existing] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(sql`lower(${tags.name}) = lower(${name})`)
    .limit(1);
  if (existing) throw new AdminError("tag_exists", "That tag already exists.");
  const [created] = await db.insert(tags).values({ name, color }).returning();
  if (!created) throw new AdminError("tag_create_failed", "Could not create that tag.");
  await audit(actor, "tag_create", null, { tagId: created.id, name, color });
  return { id: created.id, name: created.name, color: created.color };
}

export async function deleteTag(actor: UserRow, id: string): Promise<void> {
  const [tag] = await db.select().from(tags).where(eq(tags.id, id)).limit(1);
  if (!tag) throw new AdminError("tag_not_found", "That tag does not exist.", 404);
  await db.delete(tags).where(eq(tags.id, id));
  await audit(actor, "tag_delete", null, { tagId: id, name: tag.name });
}

export async function setUserTags(
  actor: UserRow,
  targetId: string,
  tagIds: string[],
): Promise<AdminUserView> {
  const target = await targetRow(targetId);
  const ids = [...new Set(tagIds.filter(Boolean))];
  const valid = ids.length ? await db.select().from(tags).where(inArray(tags.id, ids)) : [];
  if (valid.length !== ids.length) {
    throw new AdminError("tag_not_found", "One of those tags no longer exists.", 404);
  }
  await db.transaction(async (tx) => {
    await tx.delete(userTags).where(eq(userTags.userId, target.id));
    if (valid.length > 0) {
      await tx.insert(userTags).values(
        valid.map((tag) => ({
          userId: target.id,
          tagId: tag.id,
          assignedBy: actor.username,
        })),
      );
    }
  });
  await audit(actor, "tags_set", target, { tags: valid.map((tag) => tag.name) });
  return toAdminUserWithTags(target);
}
