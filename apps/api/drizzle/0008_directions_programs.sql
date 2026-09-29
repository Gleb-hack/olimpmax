CREATE TYPE "public"."education_level" AS ENUM('bachelor', 'specialist');--> statement-breakpoint
CREATE TYPE "public"."program_funding" AS ENUM('budget', 'paid_only', 'quota_only');--> statement-breakpoint
CREATE TYPE "public"."subject_relevance" AS ENUM('core', 'related');--> statement-breakpoint
CREATE TABLE "direction_subjects" (
	"direction_id" integer NOT NULL,
	"subject_id" integer NOT NULL,
	"relevance" "subject_relevance" NOT NULL,
	CONSTRAINT "direction_subjects_direction_id_subject_id_pk" PRIMARY KEY("direction_id","subject_id")
);
--> statement-breakpoint
CREATE TABLE "directions" (
	"id" serial PRIMARY KEY NOT NULL,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"education_level" "education_level" NOT NULL,
	"ugsn_code" text NOT NULL,
	"ugsn_name" text NOT NULL,
	"ege_subjects" jsonb NOT NULL,
	"popular" boolean DEFAULT false NOT NULL,
	"aliases" jsonb NOT NULL,
	"note" text,
	CONSTRAINT "directions_code_unique" UNIQUE("code"),
	CONSTRAINT "directions_code_format" CHECK ("directions"."code" ~ '^[0-9]{2}\.0[35]\.[0-9]{2}$'),
	CONSTRAINT "directions_ugsn_matches_code" CHECK ("directions"."ugsn_code" = substr("directions"."code", 1, 2) || '.00.00')
);
--> statement-breakpoint
CREATE TABLE "olympiad_directions" (
	"olympiad_id" integer NOT NULL,
	"direction_id" integer NOT NULL,
	"via_rsosh" boolean NOT NULL,
	"subject_relevance" "subject_relevance",
	CONSTRAINT "olympiad_directions_olympiad_id_direction_id_pk" PRIMARY KEY("olympiad_id","direction_id"),
	CONSTRAINT "olympiad_directions_has_reason" CHECK ("olympiad_directions"."via_rsosh" or "olympiad_directions"."subject_relevance" is not null)
);
--> statement-breakpoint
CREATE TABLE "university_programs" (
	"id" serial PRIMARY KEY NOT NULL,
	"university_id" integer NOT NULL,
	"direction_id" integer NOT NULL,
	"name" text NOT NULL,
	"faculty" text,
	"exams_required" jsonb NOT NULL,
	"exams_choice" jsonb NOT NULL,
	"internal_exam" boolean DEFAULT false NOT NULL,
	"passing_score" smallint,
	"passing_score_form" text,
	"passing_year" smallint,
	"funding" "program_funding" NOT NULL,
	"source_url" text NOT NULL,
	"source_id" text,
	CONSTRAINT "university_programs_score_valid" CHECK ("university_programs"."passing_score" is null or ("university_programs"."passing_score" between 0 and 500 and "university_programs"."passing_year" is not null))
);
--> statement-breakpoint
CREATE TABLE "user_directions" (
	"user_id" uuid NOT NULL,
	"direction_id" integer NOT NULL,
	CONSTRAINT "user_directions_user_id_direction_id_pk" PRIMARY KEY("user_id","direction_id")
);
--> statement-breakpoint
CREATE TABLE "user_universities" (
	"user_id" uuid NOT NULL,
	"university_id" integer NOT NULL,
	CONSTRAINT "user_universities_user_id_university_id_pk" PRIMARY KEY("user_id","university_id")
);
--> statement-breakpoint
ALTER TABLE "direction_subjects" ADD CONSTRAINT "direction_subjects_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_subjects" ADD CONSTRAINT "direction_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "olympiad_directions" ADD CONSTRAINT "olympiad_directions_olympiad_id_olympiads_id_fk" FOREIGN KEY ("olympiad_id") REFERENCES "public"."olympiads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "olympiad_directions" ADD CONSTRAINT "olympiad_directions_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "university_programs" ADD CONSTRAINT "university_programs_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_directions" ADD CONSTRAINT "user_directions_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_directions" ADD CONSTRAINT "user_directions_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_universities" ADD CONSTRAINT "user_universities_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_universities" ADD CONSTRAINT "user_universities_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "direction_subjects_subject_idx" ON "direction_subjects" USING btree ("subject_id");--> statement-breakpoint
CREATE INDEX "directions_ugsn_idx" ON "directions" USING btree ("ugsn_code");--> statement-breakpoint
CREATE INDEX "olympiad_directions_direction_idx" ON "olympiad_directions" USING btree ("direction_id","olympiad_id");--> statement-breakpoint
CREATE INDEX "university_programs_university_idx" ON "university_programs" USING btree ("university_id","direction_id");--> statement-breakpoint
CREATE INDEX "university_programs_direction_idx" ON "university_programs" USING btree ("direction_id");