import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { env, isProd } from "../env.js";
import * as schema from "./schema.js";

/**
 * `prepare: false` keeps us compatible with transaction-mode poolers (the
 * InfraFlow pooler, PgBouncer, Supabase, Neon…). The cost is negligible for
 * this workload and it removes a whole class of deploy-day surprises.
 */
export const sql = postgres(env.DATABASE_URL, {
  max: isProd ? 10 : 6,
  idle_timeout: 30,
  connect_timeout: 15,
  prepare: false,
  onnotice: () => {},
});

export const db = drizzle(sql, { schema });
export { schema };
