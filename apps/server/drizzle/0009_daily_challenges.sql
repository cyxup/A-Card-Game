CREATE TABLE "daily_claims" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"day" varchar(10) NOT NULL,
	"challenge_id" varchar(32) NOT NULL,
	"reward" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "daily_claims" ADD CONSTRAINT "daily_claims_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "daily_claims_user_day_challenge_idx" ON "daily_claims" USING btree ("user_id","day","challenge_id");--> statement-breakpoint
CREATE INDEX "daily_claims_day_idx" ON "daily_claims" USING btree ("day");
