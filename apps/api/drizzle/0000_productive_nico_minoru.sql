CREATE TYPE "public"."olympiad_format" AS ENUM('onsite', 'online', 'hybrid', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."participation_type" AS ENUM('individual', 'team', 'mixed', 'unknown');--> statement-breakpoint
CREATE TYPE "public"."schedule_status" AS ENUM('published', 'unknown', 'not_held');--> statement-breakpoint
CREATE TYPE "public"."stage_kind" AS ENUM('registration', 'competition', 'other');--> statement-breakpoint
CREATE TYPE "public"."stage_origin" AS ENUM('csv', 'verified_import');--> statement-breakpoint
CREATE TYPE "public"."date_verification" AS ENUM('unverified', 'verified', 'needs_review');--> statement-breakpoint
CREATE TABLE "import_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_file" text NOT NULL,
	"sha256" text NOT NULL,
	"row_count" integer NOT NULL,
	"report" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "olympiad_subjects" (
	"olympiad_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	CONSTRAINT "olympiad_subjects_olympiad_id_subject_id_pk" PRIMARY KEY("olympiad_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "olympiads" (
	"id" integer PRIMARY KEY NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"grade_from" integer,
	"grade_to" integer,
	"classes_raw" text,
	"format" "olympiad_format" NOT NULL,
	"participation" "participation_type" NOT NULL,
	"rating" double precision,
	"schedule_status" "schedule_status" NOT NULL,
	"status_raw" text NOT NULL,
	"calendar_raw" text,
	"calendar_hash" text NOT NULL,
	"schedule_updated_raw" text,
	"organizers" jsonb NOT NULL,
	"contacts" jsonb NOT NULL,
	"documents" jsonb NOT NULL,
	"features_raw" text,
	"source_url" text NOT NULL,
	"source_group" text,
	"raw_source" jsonb NOT NULL,
	"search_text" text NOT NULL,
	"first_imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "olympiads_id_positive" CHECK ("olympiads"."id" > 0),
	CONSTRAINT "olympiads_grades_valid" CHECK (("olympiads"."grade_from" is null and "olympiads"."grade_to" is null) or ("olympiads"."grade_from" is not null and "olympiads"."grade_to" is not null and "olympiads"."grade_from" between 1 and 11 and "olympiads"."grade_to" between "olympiads"."grade_from" and 11)),
	CONSTRAINT "olympiads_rating_valid" CHECK ("olympiads"."rating" is null or "olympiads"."rating" between 0 and 10)
);
--> statement-breakpoint
CREATE TABLE "plan_items" (
	"user_id" uuid NOT NULL,
	"olympiad_id" integer NOT NULL,
	"tracking" boolean DEFAULT true NOT NULL,
	"note" text,
	"saved_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "plan_items_user_id_olympiad_id_pk" PRIMARY KEY("user_id","olympiad_id"),
	CONSTRAINT "plan_note_length" CHECK ("plan_items"."note" is null or length("plan_items"."note") <= 2000)
);
--> statement-breakpoint
CREATE TABLE "olympiad_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"olympiad_id" integer NOT NULL,
	"source_key" text NOT NULL,
	"origin" "stage_origin" NOT NULL,
	"name" text,
	"kind" "stage_kind" NOT NULL,
	"raw_dates" text,
	"begins_on" date,
	"ends_on" date,
	"timezone" text DEFAULT 'Europe/Moscow' NOT NULL,
	"verification" date_verification DEFAULT 'unverified' NOT NULL,
	"source_url" text,
	"verified_at" timestamp with time zone,
	"verified_by" text,
	"calendar_hash" text NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "stages_dates_ordered" CHECK ("olympiad_stages"."begins_on" is null or "olympiad_stages"."ends_on" is null or "olympiad_stages"."begins_on" <= "olympiad_stages"."ends_on"),
	CONSTRAINT "stages_timezone_valid" CHECK ("olympiad_stages"."timezone" = 'Europe/Moscow'),
	CONSTRAINT "stages_verified_evidence" CHECK ("olympiad_stages"."verification" <> 'verified' or ("olympiad_stages"."origin" = 'verified_import' and "olympiad_stages"."source_url" is not null and "olympiad_stages"."verified_at" is not null and "olympiad_stages"."verified_by" is not null and ("olympiad_stages"."begins_on" is not null or "olympiad_stages"."ends_on" is not null))),
	CONSTRAINT "stages_csv_no_dates" CHECK ("olympiad_stages"."origin" <> 'csv' or ("olympiad_stages"."begins_on" is null and "olympiad_stages"."ends_on" is null and "olympiad_stages"."verification" = 'unverified'))
);
--> statement-breakpoint
CREATE TABLE "subjects" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "subjects_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "user_profiles" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"max_user_id" text NOT NULL,
	"display_name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_profiles_max_user_id_unique" UNIQUE("max_user_id")
);
--> statement-breakpoint
ALTER TABLE "olympiad_subjects" ADD CONSTRAINT "olympiad_subjects_olympiad_id_olympiads_id_fk" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "olympiad_subjects" ADD CONSTRAINT "olympiad_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "plan_items" ADD CONSTRAINT "plan_items_olympiad_id_olympiads_id_fk" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "olympiad_stages" ADD CONSTRAINT "olympiad_stages_olympiad_id_olympiads_id_fk" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "olympiad_subjects_subject_idx" ON "olympiad_subjects" USING btree ("subject_id","olympiad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "olympiads_source_url_unique" ON "olympiads" USING btree ("source_url");--> statement-breakpoint
CREATE INDEX "olympiads_grades_idx" ON "olympiads" USING btree ("grade_from","grade_to");--> statement-breakpoint
CREATE INDEX "olympiads_filters_idx" ON "olympiads" USING btree ("format","participation","schedule_status");--> statement-breakpoint
CREATE INDEX "olympiads_rating_idx" ON "olympiads" USING btree ("rating","id");--> statement-breakpoint
CREATE UNIQUE INDEX "stages_source_key_unique" ON "olympiad_stages" USING btree ("olympiad_id","origin","source_key");--> statement-breakpoint
CREATE INDEX "stages_next_event_idx" ON "olympiad_stages" USING btree ("verification","begins_on","ends_on");