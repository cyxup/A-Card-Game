import websocket from "@fastify/websocket";
import type { FastifyInstance } from "fastify";
import type WebSocket from "ws";
import { principalPlayerId, readSessionToken, resolveSession } from "./auth/session.js";
import { allowedOrigins } from "./env.js";
import { rateLimit } from "./lib/rate-limit.js";
import { rooms } from "./rooms/manager.js";
import type { ClientConn } from "./rooms/room.js";

const connections = new Set<ClientConn>();

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

  app.addHook("onClose", async () => {
    clearInterval(heartbeat);
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
