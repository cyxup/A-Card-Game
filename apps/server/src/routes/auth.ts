import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { hashPassword, verifyPassword } from "../auth/password.js";
import {
  createSession,
  deleteSession,
  hashToken,
  resolveSession,
  SESSION_COOKIE,
} from "../auth/session.js";
import { db } from "../db/index.js";
import { sessions, users } from "../db/schema.js";
import { ApiError, badRequest } from "../lib/http.js";
import { rateLimit } from "../lib/rate-limit.js";
import { cleanDisplayName, cleanUsername } from "../lib/text.js";
import { sessionInfo, syncUnlocks } from "../services/account.js";

const loginSchema = z.object({
  username: z.string().min(1).max(64),
  password: z.string().min(1).max(200),
});

const registerSchema = z.object({
  username: z.string().min(3).max(24),
  password: z.string().min(8).max(200),
  displayName: z.string().max(40).optional(),
});

const guestSchema = z.object({
  name: z.string().min(1).max(40),
});

function limit(request: { ip: string }, key: string, max: number, windowMs: number): void {
  const result = rateLimit(`${key}:${request.ip}`, max, windowMs);
  if (!result.ok) {
    throw new ApiError(429, "rate_limited", "Too many attempts. Give it a minute.");
  }
}

export async function authRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/session", async (request) => sessionInfo(request.principal));

  app.post("/api/auth/guest", async (request, reply) => {
    limit(request, "guest", 30, 10 * 60_000);
    const parsed = guestSchema.safeParse(request.body);
    if (!parsed.success) badRequest("Enter a name first.");
    const name = cleanDisplayName(parsed.data.name);
    if (!name) badRequest("Use 2–20 characters for your name.");

    if (request.sessionToken) {
      await deleteSession(hashToken(request.sessionToken)).catch(() => undefined);
    }
    const { sessionId } = await createSession(reply, { guestName: name });
    reply.header("Cache-Control", "no-store");
    return sessionInfo({ kind: "guest", sessionId, name });
  });

  app.post("/api/auth/register", async (request, reply) => {
    limit(request, "register", 6, 60 * 60_000);
    const parsed = registerSchema.safeParse(request.body);
    if (!parsed.success) {
      throw new ApiError(400, "invalid_input", "Check your username and password (8+ characters).");
    }
    const username = cleanUsername(parsed.data.username);
    if (!username) badRequest("Usernames are 3–16 letters, numbers or underscores.", "invalid_username");
    const displayName = cleanDisplayName(parsed.data.displayName) ?? parsed.data.username.slice(0, 20);
    if (!displayName) badRequest("Pick a display name between 2 and 20 characters.", "invalid_display_name");

    const existing = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
    if (existing.length > 0) throw new ApiError(409, "username_taken", "That username is taken.");

    const passwordHash = await hashPassword(parsed.data.password);
    let created;
    try {
      [created] = await db
        .insert(users)
        .values({ username, displayName, passwordHash })
        .returning();
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        throw new ApiError(409, "username_taken", "That username is taken.");
      }
      throw error;
    }
    if (!created) throw new ApiError(500, "server_error", "Could not create the account.");

    await syncUnlocks(created);
    if (request.sessionToken) await deleteSession(hashToken(request.sessionToken)).catch(() => undefined);
    const { sessionId } = await createSession(reply, { userId: created.id });
    reply.header("Cache-Control", "no-store");
    return sessionInfo({ kind: "user", sessionId, user: created });
  });

  app.post("/api/auth/login", async (request, reply) => {
    limit(request, "login", 15, 5 * 60_000);
    const parsed = loginSchema.safeParse(request.body);
    if (!parsed.success) badRequest("Enter your username and password.");

    const username = cleanUsername(parsed.data.username);
    if (!username) throw new ApiError(401, "invalid_login", "That username or password is not right.");

    const [user] = await db.select().from(users).where(eq(users.username, username)).limit(1);
    if (!user) throw new ApiError(401, "invalid_login", "That username or password is not right.");

    const valid = await verifyPassword(parsed.data.password, user.passwordHash);
    if (!valid) throw new ApiError(401, "invalid_login", "That username or password is not right.");

    if (request.sessionToken) await deleteSession(hashToken(request.sessionToken)).catch(() => undefined);
    const { sessionId } = await createSession(reply, { userId: user.id });
    await db.update(users).set({ lastSeenAt: new Date() }).where(eq(users.id, user.id));
    reply.header("Cache-Control", "no-store");
    return sessionInfo({ kind: "user", sessionId, user });
  });

  app.post("/api/auth/logout", async (request, reply) => {
    if (request.sessionToken) {
      await deleteSession(hashToken(request.sessionToken)).catch(() => undefined);
    } else if (request.principal) {
      await deleteSession(request.principal.sessionId).catch(() => undefined);
    }
    reply.clearCookie(SESSION_COOKIE, { path: "/" });
    reply.header("Cache-Control", "no-store");
    return { ok: true };
  });

  // Small endpoint the socket uses to make sure the session is still valid.
  app.get("/api/auth/check", async (request, reply) => {
    const principal = await resolveSession(request.sessionToken);
    if (!principal) {
      reply.code(401).send({ ok: false });
      return;
    }
    return { ok: true, kind: principal.kind };
  });

  // Housekeeping endpoint for the database connection on InfraFlow.
  app.get("/api/health", async (_request, reply) => {
    try {
      await db.select({ id: sessions.id }).from(sessions).limit(1);
      return { ok: true, db: "up", ts: Date.now() };
    } catch {
      reply.code(503).send({ ok: false, db: "down" });
      return;
    }
  });
}
