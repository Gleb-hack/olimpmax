CREATE TYPE "public"."benefit_diploma" AS ENUM('any', 'winner');--> statement-breakpoint
CREATE TYPE "public"."benefit_kind" AS ENUM('bvi', 'score_100');--> statement-breakpoint
CREATE TYPE "public"."level_source" AS ENUM('rsosh_list', 'catalog', 'series');--> statement-breakpoint
CREATE TYPE "public"."schedule_quality" AS ENUM('ok', 'placeholder', 'outdated', 'hidden');--> statement-breakpoint
CREATE TYPE "public"."stage_mode" AS ENUM('online', 'onsite', 'mixed');--> statement-breakpoint
CREATE TABLE "olympiad_series" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"aliases" jsonb NOT NULL,
	"catalog_group" text,
	"general_level" text,
	"format_raw" text,
	"schedule_raw" text,
	"schedule_quality" "schedule_quality" DEFAULT 'ok' NOT NULL,
	"rsosh_title" text,
	"rsosh_number" integer,
	"note" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "olympiad_series_slug_unique" UNIQUE("slug"),
	CONSTRAINT "series_slug_format" CHECK ("olympiad_series"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
	CONSTRAINT "series_general_level_valid" CHECK ("olympiad_series"."general_level" is null or "olympiad_series"."general_level" in ('I', 'II', 'III', 'I–II', 'II–III', 'I–III', 'ВсОШ'))
);
--> statement-breakpoint
CREATE TABLE "olympiad_series_links" (
	"olympiad_id" integer PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"profiles" jsonb NOT NULL,
	"note" text,
	"schedule_conflict" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reference_sources" (
	"key" text PRIMARY KEY NOT NULL,
	"file" text NOT NULL,
	"description" text,
	"sha256" text NOT NULL,
	"season" text NOT NULL,
	"status" text,
	"url" text,
	"imported_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "series_benefits" (
	"id" serial PRIMARY KEY NOT NULL,
	"university_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"kind" "benefit_kind" NOT NULL,
	"diploma" "benefit_diploma" NOT NULL,
	"min_score" smallint,
	"max_score" smallint,
	"requirement" text,
	"requirement_raw" text,
	CONSTRAINT "series_benefits_scores_valid" CHECK (("series_benefits"."min_score" is null or "series_benefits"."min_score" between 0 and 100) and ("series_benefits"."max_score" is null or ("series_benefits"."max_score" between 0 and 100 and "series_benefits"."min_score" is not null and "series_benefits"."max_score" >= "series_benefits"."min_score")))
);
--> statement-breakpoint
CREATE TABLE "series_profiles" (
	"id" serial PRIMARY KEY NOT NULL,
	"series_id" integer NOT NULL,
	"season" text NOT NULL,
	"profile" text NOT NULL,
	"level" smallint NOT NULL,
	"fields_of_study" text,
	CONSTRAINT "series_profiles_level_valid" CHECK ("series_profiles"."level" between 1 and 3)
);
--> statement-breakpoint
CREATE TABLE "series_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"series_id" integer NOT NULL,
	"position" smallint NOT NULL,
	"name" text NOT NULL,
	"kind" "stage_kind" NOT NULL,
	"raw_dates" text NOT NULL,
	"mode" "stage_mode",
	"begins_on" date,
	"ends_on" date,
	CONSTRAINT "series_stages_dates_ordered" CHECK ("series_stages"."begins_on" is null or "series_stages"."ends_on" is null or "series_stages"."begins_on" <= "series_stages"."ends_on")
);
--> statement-breakpoint
CREATE TABLE "universities" (
	"id" serial PRIMARY KEY NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"full_name" text,
	"city" text NOT NULL,
	"aliases" jsonb NOT NULL,
	CONSTRAINT "universities_slug_unique" UNIQUE("slug"),
	CONSTRAINT "universities_name_unique" UNIQUE("name"),
	CONSTRAINT "universities_slug_format" CHECK ("universities"."slug" ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);
--> statement-breakpoint
ALTER TABLE "olympiads" ADD COLUMN "level" text;--> statement-breakpoint
ALTER TABLE "olympiads" ADD COLUMN "level_profile" text;--> statement-breakpoint
ALTER TABLE "olympiads" ADD COLUMN "level_status" text;--> statement-breakpoint
ALTER TABLE "olympiads" ADD COLUMN "level_source_url" text;--> statement-breakpoint
ALTER TABLE "olympiads" ADD COLUMN "level_source" "level_source";--> statement-breakpoint
ALTER TABLE "olympiad_series_links" ADD CONSTRAINT "olympiad_series_links_olympiad_id_olympiads_id_fk" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "olympiad_series_links" ADD CONSTRAINT "olympiad_series_links_series_id_olympiad_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."olympiad_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_benefits" ADD CONSTRAINT "series_benefits_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_benefits" ADD CONSTRAINT "series_benefits_series_id_olympiad_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."olympiad_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_profiles" ADD CONSTRAINT "series_profiles_series_id_olympiad_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."olympiad_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "series_stages" ADD CONSTRAINT "series_stages_series_id_olympiad_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."olympiad_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "olympiad_series_links_series_idx" ON "olympiad_series_links" USING btree ("series_id","olympiad_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_benefits_unique" ON "series_benefits" USING btree ("university_id","series_id","kind","diploma");--> statement-breakpoint
CREATE INDEX "series_benefits_series_idx" ON "series_benefits" USING btree ("series_id");--> statement-breakpoint
CREATE UNIQUE INDEX "series_profiles_unique" ON "series_profiles" USING btree ("series_id","season","profile");--> statement-breakpoint
CREATE UNIQUE INDEX "series_stages_position_unique" ON "series_stages" USING btree ("series_id","position");--> statement-breakpoint
CREATE INDEX "olympiads_level_idx" ON "olympiads" USING btree ("level");--> statement-breakpoint
ALTER TABLE "olympiads" ADD CONSTRAINT "olympiads_level_valid" CHECK ("olympiads"."level" is null or "olympiads"."level" in ('I', 'II', 'III', 'I–II', 'II–III', 'I–III', 'ВсОШ'));--> statement-breakpoint
-- Backfill from the catalog export so the API keeps showing levels before the next `pnpm db:import`.
UPDATE "olympiads" AS o SET
	"level" = v.level,
	"level_profile" = CASE WHEN v.level IS NOT NULL THEN nullif(trim(o."raw_source"->>'Профиль уровня'), '') END,
	"level_status" = nullif(trim(o."raw_source"->>'Статус уровня'), ''),
	"level_source_url" = CASE WHEN v.level IS NOT NULL THEN nullif(trim(o."raw_source"->>'Источник уровня'), '') END,
	"level_source" = CASE WHEN v.level IS NOT NULL THEN 'catalog'::"level_source" END
FROM (
	SELECT "id", CASE WHEN trim("raw_source"->>'Уровень олимпиады') IN ('I', 'II', 'III', 'I–II', 'II–III', 'I–III', 'ВсОШ')
		THEN trim("raw_source"->>'Уровень олимпиады') END AS level
	FROM "olympiads"
) AS v
WHERE v."id" = o."id";
