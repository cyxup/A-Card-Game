import {
  levelForXp,
  type FriendRelationship,
  type FriendUserView,
  type UserTagView,
} from "@stacked/shared";
import { and, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "../db/index.js";
import { friendships, userBlocks, users, type UserRow } from "../db/schema.js";
import { ApiError } from "../lib/http.js";
import { equippedOf } from "./account.js";
import { tagMapForUsers } from "./tags.js";

function pair(a: string, b: string): [string, string] {
  return a < b ? [a, b] : [b, a];
}

async function userRow(id: string): Promise<UserRow> {
  const [row] = await db.select().from(users).where(eq(users.id, id)).limit(1);
  if (!row) throw new ApiError(404, "not_found", "That player does not exist.");
  return row;
}

function toView(row: UserRow, relationship: FriendRelationship, tags: UserTagView[] = []): FriendUserView {
  const loadout = equippedOf(row);
  return {
    id: row.id,
    username: row.username,
    displayName: row.displayName,
    level: levelForXp(row.xp),
    avatar: loadout.avatar,
    nameEffect: loadout.nameEffect,
    owner: row.isOwner,
    beta: row.isBetaTester,
    tags,
    relationship,
  };
}

async function relationBetween(meId: string, targetId: string): Promise<FriendRelationship> {
  const [blockedByMe] = await db
    .select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, meId), eq(userBlocks.blockedId, targetId)))
    .limit(1);
  if (blockedByMe) return "blocked";
  const [blockedMe] = await db
    .select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(and(eq(userBlocks.blockerId, targetId), eq(userBlocks.blockedId, meId)))
    .limit(1);
  if (blockedMe) return "blocked";

  const [row] = await db
    .select()
    .from(friendships)
    .where(
      or(
        and(eq(friendships.userId, meId), eq(friendships.friendId, targetId)),
        and(eq(friendships.userId, targetId), eq(friendships.friendId, meId)),
      ),
    )
    .limit(1);
  if (!row) return "none";
  if (row.status === "accepted") return "friends";
  return row.requestedById === meId ? "pending_out" : "pending_in";
}

export async function friendsPayload(meId: string): Promise<{
  friends: FriendUserView[];
  incoming: FriendUserView[];
  outgoing: FriendUserView[];
  blocked: FriendUserView[];
}> {
  const rows = await db
    .select()
    .from(friendships)
    .where(or(eq(friendships.userId, meId), eq(friendships.friendId, meId)));

  const otherIds = [...new Set(rows.map((row) => (row.userId === meId ? row.friendId : row.userId)))];
  const userRows = otherIds.length
    ? await db.select().from(users).where(inArray(users.id, otherIds))
    : [];
  const byId = new Map(userRows.map((row) => [row.id, row]));
  const tagByUser = await tagMapForUsers(otherIds);

  const friends: FriendUserView[] = [];
  const incoming: FriendUserView[] = [];
  const outgoing: FriendUserView[] = [];
  for (const row of rows) {
    const other = byId.get(row.userId === meId ? row.friendId : row.userId);
    if (!other) continue;
    const tags = tagByUser.get(other.id) ?? [];
    if (row.status === "accepted") friends.push(toView(other, "friends", tags));
    else if (row.requestedById === meId) outgoing.push(toView(other, "pending_out", tags));
    else incoming.push(toView(other, "pending_in", tags));
  }

  const blockRows = await db
    .select({ blockedId: userBlocks.blockedId })
    .from(userBlocks)
    .where(eq(userBlocks.blockerId, meId));
  const blockedIds = blockRows.map((row) => row.blockedId);
  const blockedUsers = blockedIds.length
    ? await db.select().from(users).where(inArray(users.id, blockedIds))
    : [];
  const blockedTags = await tagMapForUsers(blockedIds);

  return {
    friends: friends.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    incoming: incoming.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    outgoing: outgoing.sort((a, b) => a.displayName.localeCompare(b.displayName)),
    blocked: blockedUsers.map((row) => toView(row, "blocked", blockedTags.get(row.id) ?? [])),
  };
}

export async function searchUsers(meId: string, rawQuery: string): Promise<FriendUserView[]> {
  const q = rawQuery.trim().slice(0, 40);
  if (q.length < 2) return [];
  const rows = await db
    .select()
    .from(users)
    .where(
      and(
        eq(users.banned, false),
        or(ilike(users.username, `%${q}%`), ilike(users.displayName, `%${q}%`)),
      ),
    )
    .limit(20);
  const tagByUser = await tagMapForUsers(rows.map((row) => row.id));

  const result: FriendUserView[] = [];
  for (const row of rows) {
    if (row.id === meId) continue;
    const relationship = await relationBetween(meId, row.id);
    // Do not reveal accounts that blocked the caller.
    if (relationship === "blocked") {
      const [blockedMe] = await db
        .select({ blockerId: userBlocks.blockerId })
        .from(userBlocks)
        .where(and(eq(userBlocks.blockerId, row.id), eq(userBlocks.blockedId, meId)))
        .limit(1);
      if (blockedMe) continue;
    }
    result.push(toView(row, relationship, tagByUser.get(row.id) ?? []));
  }
  return result;
}

export async function sendRequest(me: UserRow, targetId: string): Promise<FriendRelationship> {
  if (targetId === me.id) throw new ApiError(400, "cannot_add_self", "You cannot add yourself.");
  const target = await userRow(targetId);
  if (target.banned) throw new ApiError(403, "friend_unavailable", "You cannot add that player.");
  const relationship = await relationBetween(me.id, target.id);
  if (relationship === "blocked") {
    throw new ApiError(403, "friend_unavailable", "You cannot add that player.");
  }
  if (relationship === "friends") throw new ApiError(409, "already_friends", "You are already friends.");
  if (relationship === "pending_out") throw new ApiError(409, "request_pending", "Request already sent.");
  if (relationship === "pending_in") {
    await acceptRequest(me, target.id);
    return "friends";
  }

  const [userId, friendId] = pair(me.id, target.id);
  await db
    .insert(friendships)
    .values({ userId, friendId, requestedById: me.id, status: "pending" })
    .onConflictDoNothing();
  // Re-read after the insert: a simultaneous reverse request may have won.
  return relationBetween(me.id, target.id);
}

export async function acceptRequest(me: UserRow, targetId: string): Promise<void> {
  const [userId, friendId] = pair(me.id, targetId);
  const [row] = await db
    .select()
    .from(friendships)
    .where(and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)))
    .limit(1);
  if (!row || row.status !== "pending" || row.requestedById !== targetId) {
    throw new ApiError(404, "request_not_found", "That request is gone.");
  }
  await db
    .update(friendships)
    .set({ status: "accepted", respondedAt: new Date() })
    .where(and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)));
}

export async function declineRequest(me: UserRow, targetId: string): Promise<void> {
  const [userId, friendId] = pair(me.id, targetId);
  await db
    .delete(friendships)
    .where(
      and(
        eq(friendships.userId, userId),
        eq(friendships.friendId, friendId),
        eq(friendships.status, "pending"),
        eq(friendships.requestedById, targetId),
      ),
    );
}

export async function removeFriend(me: UserRow, targetId: string): Promise<void> {
  const [userId, friendId] = pair(me.id, targetId);
  await db
    .delete(friendships)
    .where(and(eq(friendships.userId, userId), eq(friendships.friendId, friendId)));
}

export async function blockUser(me: UserRow, targetId: string): Promise<void> {
  if (targetId === me.id) throw new ApiError(400, "cannot_block_self", "You cannot block yourself.");
  await userRow(targetId);
  await db
    .insert(userBlocks)
    .values({ blockerId: me.id, blockedId: targetId })
    .onConflictDoNothing();
  await removeFriend(me, targetId);
}

export async function unblockUser(me: UserRow, targetId: string): Promise<void> {
  await db
    .delete(userBlocks)
    .where(and(eq(userBlocks.blockerId, me.id), eq(userBlocks.blockedId, targetId)));
}

export async function isFriends(meId: string, targetId: string): Promise<boolean> {
  return (await relationBetween(meId, targetId)) === "friends";
}
