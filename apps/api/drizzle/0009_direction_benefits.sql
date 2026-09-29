CREATE TABLE "direction_benefits" (
	"id" serial PRIMARY KEY NOT NULL,
	"university_id" integer NOT NULL,
	"series_id" integer NOT NULL,
	"direction_id" integer NOT NULL,
	"kind" "benefit_kind" NOT NULL,
	"diploma" "benefit_diploma" NOT NULL,
	"source_url" text NOT NULL,
	"source_page" text
);
--> statement-breakpoint
ALTER TABLE "direction_benefits" ADD CONSTRAINT "direction_benefits_university_id_universities_id_fk" FOREIGN KEY ("university_id") REFERENCES "public"."universities"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_benefits" ADD CONSTRAINT "direction_benefits_series_id_olympiad_series_id_fk" FOREIGN KEY ("series_id") REFERENCES "public"."olympiad_series"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_benefits" ADD CONSTRAINT "direction_benefits_direction_id_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."directions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "direction_benefits_unique" ON "direction_benefits" USING btree ("university_id","series_id","direction_id","kind","diploma");--> statement-breakpoint
CREATE INDEX "direction_benefits_series_idx" ON "direction_benefits" USING btree ("series_id","university_id");