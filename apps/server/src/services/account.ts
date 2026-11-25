import {
  ACHIEVEMENTS,
  COSMETICS,
  COSMETICS_BY_ID,
  SLOT_FALLBACK,
  achievementValue,
  completedAchievements,
  countedCosmetics,
  defaultLoadout,
  levelForXp,
  type AchievementView,
  type CosmeticItem,
  type Loadout,
  type PlayerStats,
  type ProfilePayload,
  type PublicUser,
  type SessionInfo,
} from "@stacked/shared";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "../db/index.js";
import { userCosmetics, users, type UserRow } from "../db/schema.js";
import type { Principal } from "../auth/session.js";
import { cleanDisplayName } from "../lib/text.js";

export function isOwner(user: Pick<UserRow, "isOwner">): boolean {
  return user.isOwner;
}

/**
 * A non-owner must never receive owner-only ids, even if they had the flag in
 * the past and rows are still sitting in user_cosmetics.
 */
export function visibleOwned(user: UserRow, ids: Iterable<string>): Set<string> {
  if (isOwner(user)) return new Set(ids);
  return new Set(
    [...ids].filter((id) => COSMETICS_BY_ID.get(id)?.unlock.type !== "owner"),
  );
}

export class AccountError extends Error {
  readonly code: string;
  readonly status: number;
  constructor(code: string, message: string, status = 400) {
    super(message);
    this.code = code;
    this.status = status;
  }
}

export function statsOf(user: UserRow): PlayerStats {
  return {
    games: user.games,
    wins: user.wins,
    jumps: user.jumps,
    stacks: user.stacks,
    cardsPlayed: user.cardsPlayed,
  };
}

export function equippedOf(user: UserRow): Loadout {
  const loadout = { ...defaultLoadout(), ...(user.equipped ?? {}) } as Loadout;
  if (!isOwner(user)) {
    for (const slot of Object.keys(SLOT_FALLBACK) as (keyof Loadout)[]) {
      if (COSMETICS_BY_ID.get(loadout[slot])?.unlock.type === "owner") {
        loadout[slot] = SLOT_FALLBACK[slot];
      }
    }
  }
  return loadout;
}

export function toPublicUser(user: UserRow): PublicUser {
  return {
    id: user.id,
    username: user.username,
    displayName: user.displayName,
    level: levelForXp(user.xp),
    xp: user.xp,
    coins: user.coins,
    avatar: equippedOf(user).avatar,
    cardBack: equippedOf(user).cardBack,
    table: equippedOf(user).table,
    nameEffect: equippedOf(user).nameEffect,
    winEffect: equippedOf(user).winEffect,
    stats: statsOf(user),
    createdAt: user.createdAt.getTime(),
    owner: isOwner(user),
  };
}

export async function getOwnedIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ itemId: userCosmetics.itemId })
    .from(userCosmetics)
    .where(eq(userCosmetics.userId, userId));
  return new Set(rows.map((row) => row.itemId));
}

export interface SyncResult {
  owned: Set<string>;
  achievements: string[];
  newly: string[];
}

/**
 * Grants every cosmetic the account has qualified for (defaults, level items,
 * achievement rewards) and reports what was just unlocked.
 */
export async function syncUnlocks(user: UserRow): Promise<SyncResult> {
  const rawOwned = await getOwnedIds(user.id);
  const owned = visibleOwned(user, rawOwned);
  const stats = statsOf(user);
  const level = levelForXp(user.xp);
  const owner = isOwner(user);

  // If the owner flag was removed, purge the hidden rows so counts and
  // achievement progress cannot be inflated by them.
  const stale = [...rawOwned].filter((id) => !owned.has(id));
  if (stale.length > 0) {
    await db
      .delete(userCosmetics)
      .where(and(eq(userCosmetics.userId, user.id), inArray(userCosmetics.itemId, stale)));
  }

  const base = COSMETICS.filter(
    (item) =>
      item.unlock.type === "default" ||
      (item.unlock.type === "level" && level >= item.unlock.level) ||
      (item.unlock.type === "owner" && owner),
  );
  const baseOwned = new Set([...owned, ...base.map((item) => item.id)]);
  const achievements = completedAchievements(stats, countedCosmetics(baseOwned));

  const earned = COSMETICS.filter(
    (item) => item.unlock.type === "achievement" && achievements.includes(item.unlock.id),
  );
  const desired = [...base, ...earned];
  const missing = desired.filter((item) => !owned.has(item.id));

  if (missing.length > 0) {
    await db
      .insert(userCosmetics)
      .values(
        missing.map((item) => ({
          userId: user.id,
          itemId: item.id,
          source:
            item.unlock.type === "achievement"
              ? "achievement"
              : item.unlock.type === "level"
                ? "level"
                : item.unlock.type === "owner"
                  ? "owner"
                  : "default",
        })),
      )
      .onConflictDoNothing();
  }

  const finalOwned = new Set([...owned, ...missing.map((item) => item.id)]);
  const finalAchievements = completedAchievements(stats, countedCosmetics(finalOwned));
  return { owned: finalOwned, achievements: finalAchievements, newly: missing.map((item) => item.id) };
}

export function achievementViews(user: UserRow, ownedCount: number): AchievementView[] {
  const stats = statsOf(user);
  return ACHIEVEMENTS.map((achievement) => {
    const progress = achievementValue(achievement, stats, ownedCount);
    return {
      id: achievement.id,
      name: achievement.name,
      description: achievement.description,
      metric: achievement.metric,
      goal: achievement.goal,
      progress: Math.min(progress, achievement.goal),
      unlocked: progress >= achievement.goal,
      reward: achievement.reward ?? null,
    };
  });
}

export async function sessionInfo(principal: Principal | null): Promise<SessionInfo> {
  if (!principal) {
    return { kind: "anon", user: null, guestName: null, unlocks: [], achievements: [] };
  }

  if (principal.kind === "guest") {
    return {
      kind: "guest",
      user: null,
      guestName: principal.name,
      unlocks: COSMETICS.filter((item) => item.unlock.type === "default").map((item) => item.id),
      achievements: [],
    };
  }

  const sync = await syncUnlocks(principal.user);
  return {
    kind: "user",
    user: toPublicUser(principal.user),
    guestName: null,
    unlocks: [...sync.owned],
    achievements: sync.achievements,
  };
}

export async function profilePayload(user: UserRow): Promise<ProfilePayload> {
  const sync = await syncUnlocks(user);
  return {
    user: toPublicUser(user),
    // Owner-only pieces are not part of the public catalogue.
    items: COSMETICS.filter((item) => item.unlock.type !== "owner" || isOwner(user)),
    owned: [...sync.owned],
    achievements: achievementViews(user, countedCosmetics(sync.owned)),
    equipped: equippedOf(user),
  };
}

export async function itemIsOwned(user: UserRow, item: CosmeticItem): Promise<boolean> {
  if (item.unlock.type === "default") return true;
  if (item.unlock.type === "owner") return isOwner(user);
  const [row] = await db
    .select({ itemId: userCosmetics.itemId })
    .from(userCosmetics)
    .where(and(eq(userCosmetics.userId, user.id), eq(userCosmetics.itemId, item.id)))
    .limit(1);
  return Boolean(row);
}

export async function purchaseItem(user: UserRow, itemId: string): Promise<{ user: UserRow; profile: ProfilePayload }> {
  const item = COSMETICS_BY_ID.get(itemId);
  if (!item) throw new AccountError("unknown_item", "That cosmetic does not exist.", 404);
  if (item.unlock.type !== "shop") {
    throw new AccountError("not_for_sale", "You cannot buy that one — it has to be earned.", 400);
  }
  if (await itemIsOwned(user, item)) {
    throw new AccountError("already_owned", "You already own that.", 409);
  }

  const price = item.unlock.price;
  await db.transaction(async (tx) => {
    const [current] = await tx.select().from(users).where(eq(users.id, user.id)).for("update").limit(1);
    if (!current) throw new AccountError("not_found", "Account not found.", 404);
    if (current.coins < price) {
      throw new AccountError("not_enough_coins", `You need ${price - current.coins} more coins.`, 402);
    }
    await tx
      .update(users)
      .set({ coins: current.coins - price })
      .where(eq(users.id, user.id));
    await tx
      .insert(userCosmetics)
      .values({ userId: user.id, itemId: item.id, source: "purchase" })
      .onConflictDoNothing();
  });

  const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!fresh) throw new AccountError("not_found", "Account not found.", 404);
  return { user: fresh, profile: await profilePayload(fresh) };
}

export async function equipItem(user: UserRow, itemId: string): Promise<{ user: UserRow; profile: ProfilePayload }> {
  const item = COSMETICS_BY_ID.get(itemId);
  if (!item) throw new AccountError("unknown_item", "That cosmetic does not exist.", 404);
  if (!(await itemIsOwned(user, item))) {
    throw new AccountError("not_owned", "Unlock that first.", 403);
  }
  const loadout = { ...equippedOf(user), [item.slot]: item.id };
  const [fresh] = await db
    .update(users)
    .set({ equipped: loadout })
    .where(eq(users.id, user.id))
    .returning();
  if (!fresh) throw new AccountError("not_found", "Account not found.", 404);
  return { user: fresh, profile: await profilePayload(fresh) };
}

export async function updateDisplayName(user: UserRow, rawName: unknown): Promise<UserRow> {
  const displayName = cleanDisplayName(rawName);
  if (!displayName) throw new AccountError("invalid_name", "Use 2–20 characters.", 400);
  const [fresh] = await db
    .update(users)
    .set({ displayName })
    .where(eq(users.id, user.id))
    .returning();
  if (!fresh) throw new AccountError("not_found", "Account not found.", 404);
  return fresh;
}

export async function leaderboard(limit = 50) {
  const rows = await db
    .select({
      id: users.id,
      displayName: users.displayName,
      xp: users.xp,
      wins: users.wins,
      games: users.games,
      equipped: users.equipped,
    })
    .from(users)
    .orderBy(desc(users.xp), desc(users.wins))
    .limit(limit);

  return rows.map((row, index) => {
    const loadout = { ...SLOT_FALLBACK, ...(row.equipped ?? {}) };
    return {
      rank: index + 1,
      id: row.id,
      displayName: row.displayName,
      level: levelForXp(row.xp),
      xp: row.xp,
      wins: row.wins,
      games: row.games,
      avatar: loadout.avatar,
      nameEffect: loadout.nameEffect,
    };
  });
}
