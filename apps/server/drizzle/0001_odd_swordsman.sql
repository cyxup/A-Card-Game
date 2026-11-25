ALTER TABLE "users" ADD COLUMN "recovery_hash" varchar(64);--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "recovery_issued_at" timestamp with time zone;