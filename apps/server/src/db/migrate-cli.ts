import { runMigrations } from "./migrate.js";
import { sql } from "./index.js";

runMigrations()
  .then(async () => {
    console.log("Database is up to date.");
    await sql.end();
  })
  .catch(async (error) => {
    console.error("Migration failed:", error);
    await sql.end();
    process.exit(1);
  });
