import {
  CHAT_PACKS,
  CHAT_PACKS_BY_ID,
  chatPackVisible,
  type ChatPackView,
} from "@stacked/shared";
import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { userChatPacks, users, type UserRow } from "../db/schema.js";
import { ApiError } from "../lib/http.js";

const SHOP_PACKS = CHAT_PACKS.filter((pack) => pack.unlock.type === "shop");

async function ownedPackIds(userId: string): Promise<Set<string>> {
  const rows = await db
    .select({ packId: userChatPacks.packId })
    .from(userChatPacks)
    .where(eq(userChatPacks.userId, userId));
  return new Set(rows.map((row) => row.packId));
}

function entitledByFlag(user: UserRow, packId: string): boolean {
  const pack = CHAT_PACKS_BY_ID.get(packId);
  if (!pack) return false;
  if (pack.unlock.type === "default") return true;
  if (pack.unlock.type === "owner") return user.isOwner;
  if (pack.unlock.type === "beta") return user.isBetaTester || user.isOwner;
  return false;
}

export async function chatPackIdsForUser(user: UserRow): Promise<string[]> {
  const owned = await ownedPackIds(user.id);
  return CHAT_PACKS.filter(
    (pack) =>
      entitledByFlag(user, pack.id) ||
      (pack.unlock.type === "shop" && owned.has(pack.id)),
  ).map((pack) => pack.id);
}

export async function profileChatPacks(user: UserRow): Promise<ChatPackView[]> {
  const owned = await ownedPackIds(user.id);
  return CHAT_PACKS.filter((pack) =>
    chatPackVisible(pack, { owner: user.isOwner, beta: user.isBetaTester }),
  ).map((pack) => ({
    ...pack,
    owned:
      entitledByFlag(user, pack.id) ||
      (pack.unlock.type === "shop" && owned.has(pack.id)),
  }));
}

export async function hasChatPack(user: UserRow, packId: string): Promise<boolean> {
  const pack = CHAT_PACKS_BY_ID.get(packId);
  if (!pack) return false;
  if (entitledByFlag(user, pack.id)) return true;
  if (pack.unlock.type !== "shop") return false;
  const [row] = await db
    .select({ packId: userChatPacks.packId })
    .from(userChatPacks)
    .where(and(eq(userChatPacks.userId, user.id), eq(userChatPacks.packId, pack.id)))
    .limit(1);
  return Boolean(row);
}

export async function purchaseChatPack(user: UserRow, packId: string): Promise<UserRow> {
  const pack = CHAT_PACKS_BY_ID.get(packId);
  if (!pack) throw new ApiError(404, "unknown_pack", "That quick-chat pack does not exist.");
  if (pack.unlock.type !== "shop") {
    throw new ApiError(400, "not_for_sale", "That pack cannot be bought.");
  }
  if (await hasChatPack(user, pack.id)) {
    throw new ApiError(409, "already_owned", "You already own that pack.");
  }

  const price = pack.unlock.price;
  await db.transaction(async (tx) => {
    const [current] = await tx
      .select()
      .from(users)
      .where(eq(users.id, user.id))
      .for("update")
      .limit(1);
    if (!current) throw new ApiError(404, "not_found", "Account not found.");
    // Two concurrent purchases of the same pack must not charge twice.
    const [already] = await tx
      .select({ packId: userChatPacks.packId })
      .from(userChatPacks)
      .where(and(eq(userChatPacks.userId, user.id), eq(userChatPacks.packId, pack.id)))
      .limit(1);
    if (already) throw new ApiError(409, "already_owned", "You already own that pack.");
    if (current.coins < price) {
      throw new ApiError(402, "not_enough_coins", `You need ${price - current.coins} more coins.`);
    }
    await tx
      .update(users)
      .set({ coins: current.coins - price })
      .where(eq(users.id, user.id));
    await tx
      .insert(userChatPacks)
      .values({ userId: user.id, packId: pack.id, source: "purchase" })
      .onConflictDoNothing();
  });

  const [fresh] = await db.select().from(users).where(eq(users.id, user.id)).limit(1);
  if (!fresh) throw new ApiError(404, "not_found", "Account not found.");
  return fresh;
}

/** Admin "unlock every cosmetic" also unlocks every purchasable chat pack. */
export async function grantAllChatPacks(userId: string): Promise<void> {
  if (SHOP_PACKS.length === 0) return;
  await db
    .insert(userChatPacks)
    .values(SHOP_PACKS.map((pack) => ({ userId, packId: pack.id, source: "admin" })))
    .onConflictDoNothing();
}
