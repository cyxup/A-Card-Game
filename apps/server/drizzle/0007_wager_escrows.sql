ALTER TABLE "matches" ADD COLUMN "log" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
CREATE TABLE "wager_escrows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"room_code" varchar(8) NOT NULL,
	"user_id" uuid NOT NULL,
	"match_id" uuid,
	"amount" integer NOT NULL,
	"status" varchar(16) DEFAULT 'held' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"settled_at" timestamp with time zone
);
--> statement-breakpoint
ALTER TABLE "wager_escrows" ADD CONSTRAINT "wager_escrows_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "wager_escrows" ADD CONSTRAINT "wager_escrows_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "wager_escrows_room_idx" ON "wager_escrows" USING btree ("room_code");--> statement-breakpoint
CREATE INDEX "wager_escrows_user_idx" ON "wager_escrows" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "wager_escrows_status_idx" ON "wager_escrows" USING btree ("status");
