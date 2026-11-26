import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { type FriendPresence, type FriendsPayload, type FriendUserView } from "@stacked/shared";
import { ApiError, badRequest, requireUser } from "../lib/http.js";
import { rateLimit } from "../lib/rate-limit.js";
import { rooms } from "../rooms/manager.js";
import {
  acceptRequest,
  blockUser,
  declineRequest,
  friendsPayload,
  isFriends,
  playerCard,
  removeFriend,
  searchUsers,
  sendRequest,
  unblockUser,
} from "../services/friends.js";

const targetSchema = z.object({ userId: z.string().uuid() });
const idSchema = z.string().uuid();

function gate(key: string, limit: number, windowMs: number): void {
  if (!rateLimit(key, limit, windowMs).ok) {
    throw new ApiError(429, "rate_limited", "Slow down a little.");
  }
}

function notifyFriendsChanged(...userIds: string[]): void {
  for (const userId of new Set(userIds.filter(Boolean))) {
    rooms.sendToUser(userId, { t: "friends_changed" });
  }
}

function presenceFor(userId: string): FriendPresence {
  const entry = rooms.presenceFor([userId]).get(userId);
  if (!entry?.online) return { status: "offline", room: null };
  const room = entry.room;
  if (!room || room.phase === "ended") return { status: "online", room: null };
  return {
    status: room.phase === "playing" ? "playing" : "lobby",
    room: {
      // Private codes stay private; public lobbies are already discoverable.
      code: room.visibility === "public" ? room.code : null,
      players: room.seats.length,
      maxPlayers: room.rules.maxPlayers,
      visibility: room.visibility,
      phase: room.phase,
    },
  };
}

export async function friendsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/friends", async (request) => {
    const principal = requireUser(request);
    gate(`friends:${principal.user.id}`, 180, 60_000);
    const payload = await friendsPayload(principal.user.id);
    const friends: FriendUserView[] = payload.friends.map((friend) => ({
      ...friend,
      presence: presenceFor(friend.id),
    }));

    const room = rooms.activeRoomForUser(principal.user.id);
    const canInvite = Boolean(
      room &&
        room.phase === "lobby" &&
        room.hostId === principal.user.id &&
        room.seats.length < room.rules.maxPlayers,
    );
    const result: FriendsPayload = {
      ...payload,
      friends,
      you: {
        roomCode: room && room.phase === "lobby" ? room.code : null,
        canInvite,
      },
    };
    return result;
  });

  app.get("/api/friends/search", async (request) => {
    const principal = requireUser(request);
    gate(`friend-search:${principal.user.id}`, 30, 60_000);
    const q = String((request.query as { q?: string })?.q ?? "");
    return searchUsers(principal.user.id, q);
  });

  app.get("/api/players/:id", async (request) => {
    gate(`player-card:${request.ip}`, 180, 60_000);
    const parsed = idSchema.safeParse((request.params as { id?: string }).id);
    if (!parsed.success) badRequest("That player does not exist.");
    const principal = request.principal;
    const viewerId = principal?.kind === "user" ? principal.user.id : null;
    return playerCard(parsed.data, viewerId);
  });

  app.post("/api/friends/request", async (request) => {
    const principal = requireUser(request);
    gate(`friend-request:${principal.user.id}`, 20, 60 * 60_000);
    const parsed = targetSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick a player.");
    const relationship = await sendRequest(principal.user, parsed.data.userId);
    if (relationship !== "friends") {
      rooms.sendToUser(parsed.data.userId, {
        t: "toast",
        tone: "info",
        message: "New friend request.",
      });
    } else {
      rooms.sendToUser(parsed.data.userId, {
        t: "toast",
        tone: "success",
        message: "Friend request accepted.",
      });
    }
    notifyFriendsChanged(principal.user.id, parsed.data.userId);
    return { ok: true, relationship };
  });

  app.post("/api/friends/:id/accept", async (request) => {
    const principal = requireUser(request);
    gate(`friend-mutate:${principal.user.id}`, 60, 60_000);
    const target = idSchema.safeParse((request.params as { id?: string })?.id);
    if (!target.success) badRequest("Pick a request.");
    await acceptRequest(principal.user, target.data);
    notifyFriendsChanged(principal.user.id, target.data);
    return { ok: true };
  });

  app.post("/api/friends/:id/decline", async (request) => {
    const principal = requireUser(request);
    gate(`friend-mutate:${principal.user.id}`, 60, 60_000);
    const target = idSchema.safeParse((request.params as { id?: string })?.id);
    if (!target.success) badRequest("Pick a request.");
    await declineRequest(principal.user, target.data);
    notifyFriendsChanged(principal.user.id, target.data);
    return { ok: true };
  });

  app.post("/api/friends/:id/remove", async (request) => {
    const principal = requireUser(request);
    gate(`friend-mutate:${principal.user.id}`, 60, 60_000);
    const target = idSchema.safeParse((request.params as { id?: string })?.id);
    if (!target.success) badRequest("Pick a friend.");
    await removeFriend(principal.user, target.data);
    notifyFriendsChanged(principal.user.id, target.data);
    return { ok: true };
  });

  app.post("/api/friends/:id/block", async (request) => {
    const principal = requireUser(request);
    gate(`friend-mutate:${principal.user.id}`, 60, 60_000);
    const target = idSchema.safeParse((request.params as { id?: string })?.id);
    if (!target.success) badRequest("Pick a player.");
    await blockUser(principal.user, target.data);
    notifyFriendsChanged(principal.user.id, target.data);
    return { ok: true };
  });

  app.post("/api/friends/:id/unblock", async (request) => {
    const principal = requireUser(request);
    gate(`friend-mutate:${principal.user.id}`, 60, 60_000);
    const target = idSchema.safeParse((request.params as { id?: string })?.id);
    if (!target.success) badRequest("Pick a player.");
    await unblockUser(principal.user, target.data);
    notifyFriendsChanged(principal.user.id, target.data);
    return { ok: true };
  });

  app.post("/api/friends/invite", async (request) => {
    const principal = requireUser(request);
    gate(`friend-invite:${principal.user.id}`, 10, 60_000);
    const parsed = targetSchema.safeParse(request.body ?? {});
    if (!parsed.success) badRequest("Pick a friend.");

    if (!(await isFriends(principal.user.id, parsed.data.userId))) {
      throw badRequest("You can only invite friends.", "not_friends");
    }
    const room = rooms.activeRoomForUser(principal.user.id);
    if (!room || room.phase !== "lobby" || room.hostId !== principal.user.id) {
      throw badRequest("Open a lobby as host first.", "not_hosting");
    }
    if (room.seats.length >= room.rules.maxPlayers) {
      throw badRequest("That table is full.", "room_full");
    }
    const presence = rooms.presenceFor([parsed.data.userId]).get(parsed.data.userId);
    if (!presence?.online) {
      throw badRequest("That friend is offline.", "friend_offline");
    }

    rooms.sendToUser(parsed.data.userId, {
      t: "friend_invite",
      inviteId: randomUUID(),
      fromName: principal.user.displayName,
      roomCode: room.code,
      players: room.seats.length,
      maxPlayers: room.rules.maxPlayers,
      expiresAt: Date.now() + 120_000,
    });
    return { ok: true };
  });
}
