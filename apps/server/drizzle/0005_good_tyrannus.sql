CREATE TABLE "user_chat_packs" (
	"user_id" uuid NOT NULL,
	"pack_id" varchar(40) NOT NULL,
	"source" varchar(20) DEFAULT 'purchase' NOT NULL,
	"unlocked_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_chat_packs_user_id_pack_id_pk" PRIMARY KEY("user_id","pack_id")
);
--> statement-breakpoint
ALTER TABLE "user_chat_packs" ADD CONSTRAINT "user_chat_packs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;