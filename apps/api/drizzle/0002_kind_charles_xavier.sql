CREATE TABLE "user_subjects" (
	"user_id" uuid NOT NULL,
	"subject_id" integer NOT NULL,
	CONSTRAINT "user_subjects_user_id_subject_id_pk" PRIMARY KEY("user_id","subject_id")
);
--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "profile_name" text;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "grade" integer;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "region" text DEFAULT '' NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "online" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "onsite" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "registered_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "user_subjects" ADD CONSTRAINT "user_subjects_user_id_user_profiles_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user_profiles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_subjects" ADD CONSTRAINT "user_subjects_subject_id_subjects_id_fk" FOREIGN KEY ("subject_id") REFERENCES "public"."subjects"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "profile_name_length" CHECK ("user_profiles"."profile_name" is null or length(trim("user_profiles"."profile_name")) between 1 and 80);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "profile_grade_valid" CHECK ("user_profiles"."grade" is null or "user_profiles"."grade" between 1 and 11);--> statement-breakpoint
ALTER TABLE "user_profiles" ADD CONSTRAINT "profile_region_length" CHECK (length("user_profiles"."region") <= 100);
--> statement-breakpoint
-- Existing accounts already use personal plans; preserve their completed sign-in status.
UPDATE "user_profiles" SET "registered_at" = "created_at";
