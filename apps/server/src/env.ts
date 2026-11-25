import { z } from "zod";

const bool = (fallback: boolean) =>
  z
    .string()
    .optional()
    .transform((value) => (value === undefined ? fallback : value.toLowerCase() === "true" || value === "1"));

const schema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(8080),
  HOST: z.string().default("0.0.0.0"),
  DATABASE_URL: z.string().min(1).default("postgres://stacked:stacked@localhost:5432/stacked"),
  APP_ORIGIN: z.string().default("http://localhost:5173"),
  COOKIE_SECRET: z.string().min(16).default("dev-only-secret-change-me-123"),
  COOKIE_SECURE: bool(false),
  MIGRATE_ON_START: bool(true),
  WEB_DIST: z.string().default("apps/web/dist"),
  TRUST_PROXY: bool(true),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
export const isProd = env.NODE_ENV === "production";

/** Comma separated list of origins allowed to hit mutating routes / the socket. */
export const allowedOrigins = new Set(
  env.APP_ORIGIN.split(",")
    .map((origin) => origin.trim().replace(/\/$/, ""))
    .filter(Boolean),
);
