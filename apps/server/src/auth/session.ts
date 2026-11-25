import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, lt } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { db } from "../db/index.js";
import { sessions, users, type UserRow } from "../db/schema.js";
import { env } from "../env.js";

export const SESSION_COOKIE = "stacked_sid";
const DAY = 24 * 60 * 60 * 1000;
const USER_TTL = 30 * DAY;
const GUEST_TTL = 7 * DAY;

export interface UserPrincipal {
  kind: "user";
  sessionId: string;
  user: UserRow;
}

export interface GuestPrincipal {
  kind: "guest";
  sessionId: string;
  name: string;
}

export type Principal = UserPrincipal | GuestPrincipal;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Stable, non-reversible public identity for a guest session. */
export function guestPlayerId(sessionId: string): string {
  return `g_${sessionId.slice(0, 14)}`;
}

export function principalPlayerId(principal: Principal): string {
  return principal.kind === "user" ? principal.user.id : guestPlayerId(principal.sessionId);
}

export function readSessionToken(request: FastifyRequest): string | null {
  return request.cookies?.[SESSION_COOKIE] ?? null;
}

export async function createSession(
  reply: FastifyReply,
  input: { userId?: string | null; guestName?: string | null },
): Promise<{ sessionId: string; token: string; expiresAt: Date }> {
  const token = randomBytes(32).toString("base64url");
  const sessionId = hashToken(token);
  const ttl = input.userId ? USER_TTL : GUEST_TTL;
  const expiresAt = new Date(Date.now() + ttl);

  await db.insert(sessions).values({
    id: sessionId,
    userId: input.userId ?? null,
    guestName: input.guestName ?? null,
    expiresAt,
  });

  reply.setCookie(SESSION_COOKIE, token, {
    path: "/",
    httpOnly: true,
    sameSite: "lax",
    secure: env.COOKIE_SECURE,
    maxAge: Math.floor(ttl / 1000),
  });

  return { sessionId, token, expiresAt };
}

export async function resolveSession(token: string | null): Promise<Principal | null> {
  if (!token || token.length < 20) return null;
  const sessionId = hashToken(token);
  const [row] = await db
    .select({ session: sessions, user: users })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .where(and(eq(sessions.id, sessionId), gt(sessions.expiresAt, new Date())))
    .limit(1);

  if (!row) return null;

  // Keep last-seen fresh without a write on every single request.
  const stale = Date.now() - row.session.lastSeenAt.getTime() > 60 * 60 * 1000;
  if (stale) {
    void db
      .update(sessions)
      .set({ lastSeenAt: new Date() })
      .where(eq(sessions.id, sessionId))
      .then(() => undefined)
      .catch(() => undefined);
  }

  if (row.user) return { kind: "user", sessionId, user: row.user };
  if (row.session.guestName) return { kind: "guest", sessionId, name: row.session.guestName };
  return null;
}

export async function deleteSession(sessionId: string): Promise<void> {
  await db.delete(sessions).where(eq(sessions.id, sessionId));
}

export function clearSessionCookie(reply: FastifyReply): void {
  reply.clearCookie(SESSION_COOKIE, { path: "/" });
}

/** Housekeeping, called on an interval by the server. */
export async function pruneExpiredSessions(): Promise<void> {
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
}
