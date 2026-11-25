import path from "node:path";
import { existsSync } from "node:fs";
import compress from "@fastify/compress";
import cookie from "@fastify/cookie";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { pruneExpiredSessions, readSessionToken, resolveSession } from "./auth/session.js";
import { runMigrations } from "./db/migrate.js";
import { sql } from "./db/index.js";
import { allowedOrigins, env, isProd } from "./env.js";
import { ApiError } from "./lib/http.js";
import { registerRealtime } from "./realtime.js";
import { rooms } from "./rooms/manager.js";
import { accountRoutes } from "./routes/account.js";
import { adminRoutes } from "./routes/admin.js";
import { authRoutes } from "./routes/auth.js";
import { AccountError } from "./services/account.js";
import { AdminError } from "./services/admin.js";

const MUTATING = new Set(["POST", "PATCH", "PUT", "DELETE"]);

async function build(): Promise<ReturnType<typeof Fastify>> {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      redact: ["req.headers.cookie", "req.headers.authorization"],
    },
    trustProxy: env.TRUST_PROXY,
    bodyLimit: 32 * 1024,
  });

  rooms.setLogger(app.log);

  await app.register(cookie, { secret: env.COOKIE_SECRET });
  app.decorateRequest("principal", null);
  app.decorateRequest("sessionToken", null);

  app.addHook("onRequest", async (request, reply) => {
    if (!request.url.startsWith("/api/") || request.url.startsWith("/api/health")) return;

    if (MUTATING.has(request.method)) {
      const origin = request.headers.origin;
      if (origin) {
        const normalised = origin.replace(/\/$/, "");
        const self = `${request.protocol}://${request.host}`;
        if (!allowedOrigins.has(normalised) && normalised !== self) {
          reply.code(403).send({ error: "Cross-origin request blocked.", code: "origin_blocked" });
          return;
        }
      }
    }

    const token = readSessionToken(request);
    request.sessionToken = token;
    request.principal = await resolveSession(token);
  });

  app.addHook("onSend", async (_request, reply, payload) => {
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    if (isProd) {
      reply.header(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "script-src 'self'",
          "style-src 'self' 'unsafe-inline'",
          "img-src 'self' data: blob:",
          "font-src 'self'",
          "connect-src 'self' ws: wss:",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'none'",
        ].join("; "),
      );
      reply.header("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
    }
    return payload;
  });

  await app.register(compress, { global: true, threshold: 1024, encodings: ["gzip"] });

  await app.register(authRoutes);
  await app.register(accountRoutes);
  await app.register(adminRoutes);
  await registerRealtime(app);

  const webDist = path.resolve(env.WEB_DIST);
  const hasWeb = existsSync(path.join(webDist, "index.html"));

  if (hasWeb) {
    await app.register(fastifyStatic, {
      root: webDist,
      prefix: "/",
      setHeaders(res, filePath) {
        if (filePath.endsWith("index.html")) {
          res.setHeader("cache-control", "no-store");
        } else if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader("cache-control", "public, max-age=31536000, immutable");
        } else {
          res.setHeader("cache-control", "public, max-age=3600");
        }
      },
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/api/") || request.url.startsWith("/ws")) {
      reply.code(404).send({ error: "Not found", code: "not_found" });
      return;
    }
    const wantsHtml = String(request.headers.accept ?? "").includes("text/html");
    if (hasWeb && request.method === "GET" && wantsHtml) {
      reply.header("cache-control", "no-store");
      reply.type("text/html");
      reply.sendFile("index.html");
      return;
    }
    if (!hasWeb && request.method === "GET" && request.url === "/") {
      reply.type("text/plain").send("Stacked API is running. Build the web app with `npm run build`.");
      return;
    }
    reply.code(404).send({ error: "Not found", code: "not_found" });
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof ApiError) {
      reply.code(error.status).send({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof AccountError) {
      reply.code(error.status).send({ error: error.message, code: error.code });
      return;
    }
    if (error instanceof AdminError) {
      reply.code(error.status).send({ error: error.message, code: error.code });
      return;
    }
    if ((error as { validation?: unknown }).validation) {
      reply.code(400).send({ error: "That request was not valid.", code: "validation" });
      return;
    }
    request.log.error({ err: error }, "request failed");
    reply.code(500).send({ error: "Something went wrong. Try again.", code: "server_error" });
  });

  return app;
}

async function main(): Promise<void> {
  if (env.MIGRATE_ON_START) {
    await runMigrations();
  }

  const app = await build();

  const sweep = setInterval(() => rooms.sweep(), 15_000);
  sweep.unref();
  const prune = setInterval(() => {
    void pruneExpiredSessions().catch((error) => app.log.warn({ err: error }, "session prune failed"));
  }, 60 * 60_000);
  prune.unref();
  void pruneExpiredSessions().catch(() => undefined);

  app.addHook("onClose", async () => {
    clearInterval(sweep);
    clearInterval(prune);
    rooms.shutdown();
  });

  await app.listen({ port: env.PORT, host: env.HOST });
  app.log.info({ port: env.PORT, origin: env.APP_ORIGIN }, "Stacked is dealing");

  let closing = false;
  const shutdown = async (signal: string) => {
    if (closing) return;
    closing = true;
    app.log.info({ signal }, "shutting down");
    try {
      await app.close();
      await sql.end({ timeout: 5 });
    } finally {
      process.exit(0);
    }
  };

  process.on("SIGTERM", () => void shutdown("SIGTERM"));
  process.on("SIGINT", () => void shutdown("SIGINT"));
}

main().catch(async (error) => {
  console.error("Failed to start:", error);
  await sql.end({ timeout: 5 }).catch(() => undefined);
  process.exit(1);
});
