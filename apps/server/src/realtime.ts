import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import { eq, inArray } from "drizzle-orm";
import { principalPlayerId, readSessionToken, resolveSession } from "./auth/session.js";
import { db } from "./db/index.js";
import { sessions, users } from "./db/schema.js";
import { allowedOrigins } from "./env.js";
import { rateLimit } from "./lib/rate-limit.js";
import { rooms } from "./rooms/manager.js";
import type { ClientConn } from "./rooms/room.js";

const connections = new Set<ClientConn>();

/** Close every socket authenticated by this session (logout, token rotation). */
export function disconnectSession(sessionId: string, reason = "session ended"): void {
  for (const conn of connections) {
    if (conn.principal.sessionId !== sessionId) continue;
    try {
      conn.socket.close(4001, reason);
    } catch {
      // already gone
    }
  }
}

/** Close every socket for an account (password reset, ban). */
export function disconnectUser(userId: string, reason = "session ended"): void {
  for (const conn of connections) {
    if (conn.principal.kind !== "user" || conn.principal.user.id !== userId) continue;
    try {
      conn.socket.close(4001, reason);
    } catch {
      // already gone
    }
  }
}

/**
 * Sockets resolve their session once, at upgrade. Revalidate them periodically
 * so an expired/deleted/banned session cannot keep playing forever.
 */
async function revalidateConnections(app: FastifyInstance): Promise<void> {
  if (connections.size === 0) return;
  const ids = [...new Set([...connections].map((conn) => conn.principal.sessionId))];
  const rows = await db
    .select({
      id: sessions.id,
      userId: sessions.userId,
      expiresAt: sessions.expiresAt,
      banned: users.banned,
    })
    .from(sessions)
    .leftJoin(users, eq(sessions.userId, users.id))
    .where(inArray(sessions.id, ids));
  const valid = new Map(rows.map((row) => [row.id, row]));
  const now = Date.now();
  for (const conn of connections) {
    const row = valid.get(conn.principal.sessionId);
    if (!row || row.expiresAt.getTime() <= now || (row.userId && row.banned)) {
      try {
        conn.socket.close(4001, "session expired");
      } catch {
        // already gone
      }
    }
  }
}

export async function registerRealtime(app: FastifyInstance): Promise<void> {
  await app.register(websocket, {
    options: {
      maxPayload: 64 * 1024,
      perMessageDeflate: false,
      clientTracking: false,
    },
  });

  app.get(
    "/ws",
    {
      websocket: true,
      preValidation: async (request, reply) => {
        const origin = request.headers.origin;
        if (origin) {
          const normalised = origin.replace(/\/$/, "");
          const self = `${request.protocol}://${request.host}`;
          if (!allowedOrigins.has(normalised) && normalised !== self) {
            reply.code(403).send({ error: "Origin not allowed." });
            return;
          }
        }

        const gate = rateLimit(`ws:${request.ip}`, 40, 60_000);
        if (!gate.ok) {
          reply.code(429).send({ error: "Too many connections. Try again shortly." });
          return;
        }

        const token = readSessionToken(request);
        const principal = await resolveSession(token);
        if (!principal) {
          reply.code(401).send({ error: "Set a name or sign in first." });
          return;
        }
        request.principal = principal;
        request.sessionToken = token;
      },
    },
    (socket: WebSocket, request) => {
      const principal = request.principal;
      if (!principal) {
        socket.close(4401, "unauthorised");
        return;
      }

      const conn: ClientConn = {
        id: rooms.nextConnectionId(),
        socket,
        principal,
        playerId: principalPlayerId(principal),
        ip: request.ip,
        roomCode: null,
        alive: true,
        windowStart: Date.now(),
        windowCount: 0,
      };

      connections.add(conn);
      rooms.attach(conn);

      socket.on("message", (data) => {
        conn.alive = true;
        rooms.handleMessage(conn, data.toString());
      });
      socket.on("pong", () => {
        conn.alive = true;
      });
      socket.on("error", () => {
        // close fires right after; nothing useful to log for a dead socket
      });
      socket.on("close", () => {
        connections.delete(conn);
        rooms.detach(conn);
      });
    },
  );

  const heartbeat = setInterval(() => {
    for (const conn of connections) {
      if (!conn.alive) {
        try {
          conn.socket.terminate();
        } catch {
          // already gone
        }
        continue;
      }
      conn.alive = false;
      try {
        conn.socket.ping();
      } catch {
        // already gone
      }
    }
  }, 30_000);
  heartbeat.unref();

  const revalidator = setInterval(() => {
    void revalidateConnections(app).catch((error) =>
      app.log.warn({ err: error }, "websocket session revalidation failed"),
    );
  }, 5 * 60_000);
  revalidator.unref();

  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
    clearInterval(revalidator);
    for (const conn of connections) {
      try {
        conn.socket.close(1001, "Server shutting down");
      } catch {
        // ignore
      }
    }
    connections.clear();
  });
}
