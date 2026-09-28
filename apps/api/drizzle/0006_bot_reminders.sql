CREATE TYPE "public"."reminder_status" AS ENUM('pending', 'sent', 'failed');--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"olympiad_id" integer NOT NULL,
	"event_key" text NOT NULL,
	"event_date" date NOT NULL,
	"bucket" smallint NOT NULL,
	"status" "reminder_status" DEFAULT 'pending' NOT NULL,
	"attempts" smallint DEFAULT 1 NOT NULL,
	"error" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sent_at" timestamp with time zone,
	CONSTRAINT "reminders_bucket_valid" CHECK ("reminders"."bucket" between 0 and 30)
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "notifications_enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "bot_started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "bot_blocked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_olympiad_id_olympiads_id_fk" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "reminders_unique" ON "reminders" USING btree ("user_id","olympiad_id","event_key","bucket");--> statement-breakpoint
CREATE INDEX "reminders_status_idx" ON "reminders" USING btree ("status","updated_at");