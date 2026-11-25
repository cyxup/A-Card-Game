import {
  ACHIEVEMENTS,
  COSMETICS,
  COSMETICS_BY_ID,
  SLOT_FALLBACK,
  achievementValue,
  completedAchievements,
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
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { userCosmetics, users, type UserRow } from "../db/schema.js";
import type { Principal } from "../auth/session.js";
import { cleanDisplayName } from "../lib/text.js";

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
  return { ...defaultLoadout(), ...(user.equipped ?? {}) } as Loadout;
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
  const owned = await getOwnedIds(user.id);
  const stats = statsOf(user);
  const level = levelForXp(user.xp);

  const base = COSMETICS.filter(
    (item) =>
      item.unlock.type === "default" || (item.unlock.type === "level" && level >= item.unlock.level),
  );
  const baseOwned = new Set([...owned, ...base.map((item) => item.id)]);
  const achievements = completedAchievements(stats, baseOwned.size);

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
          source: item.unlock.type === "achievement" ? "achievement" : item.unlock.type === "level" ? "level" : "default",
        })),
      )
      .onConflictDoNothing();
  }

  const finalOwned = new Set([...owned, ...missing.map((item) => item.id)]);
  const finalAchievements = completedAchievements(stats, finalOwned.size);
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
    items: COSMETICS,
    owned: [...sync.owned],
    achievements: achievementViews(user, sync.owned.size),
    equipped: equippedOf(user),
  };
}

export async function itemIsOwned(userId: string, item: CosmeticItem): Promise<boolean> {
  if (item.unlock.type === "default") return true;
  const [row] = await db
    .select({ itemId: userCosmetics.itemId })
    .from(userCosmetics)
    .where(and(eq(userCosmetics.userId, userId), eq(userCosmetics.itemId, item.id)))
    .limit(1);
  return Boolean(row);
}

export async function purchaseItem(user: UserRow, itemId: string): Promise<{ user: UserRow; profile: ProfilePayload }> {
  const item = COSMETICS_BY_ID.get(itemId);
  if (!item) throw new AccountError("unknown_item", "That cosmetic does not exist.", 404);
  if (item.unlock.type !== "shop") {
    throw new AccountError("not_for_sale", "You cannot buy that one — it has to be earned.", 400);
  }
  if (await itemIsOwned(user.id, item)) {
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
  if (!(await itemIsOwned(user.id, item))) {
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
