CREATE EXTENSION IF NOT EXISTS pg_trgm;
--> statement-breakpoint
CREATE INDEX "olympiads_search_idx" ON "olympiads" USING gin ("search_text" gin_trgm_ops);
