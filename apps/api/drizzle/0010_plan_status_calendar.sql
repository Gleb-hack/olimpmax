CREATE TYPE "public"."plan_status" AS ENUM('planned', 'registered', 'in_progress', 'done');--> statement-breakpoint
CREATE TYPE "public"."stage_result" AS ENUM('passed', 'failed', 'prize', 'winner');--> statement-breakpoint
CREATE TABLE "plan_stage_results" (
	"user_id" uuid NOT NULL,
	"olympiad_id" integer NOT NULL,
	"stage" text NOT NULL,
	"result" "stage_result" NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_stage_results_user_id_olympiad_id_stage_pk" PRIMARY KEY("user_id","olympiad_id","stage"),
	CONSTRAINT "plan_stage_results_stage_length" CHECK (length(trim("plan_stage_results"."stage")) between 1 and 200)
);
--> statement-breakpoint
ALTER TABLE "plan_items" ADD COLUMN "status" "plan_status" DEFAULT 'planned' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "calendar_token" text;--> statement-breakpoint
ALTER TABLE "plan_stage_results" ADD CONSTRAINT "plan_stage_results_plan_item_fk" FOREIGN KEY ("user_id","olympiad_id") REFERENCES "public"."plan_items"("user_id","olympiad_id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "user_profiles_calendar_token_unique" UNIQUE("calendar_token");
