import type { Config } from "drizzle-kit";

export default {
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgres://stacked:stacked@localhost:5432/stacked",
  },
  casing: "snake_case",
} satisfies Config;
