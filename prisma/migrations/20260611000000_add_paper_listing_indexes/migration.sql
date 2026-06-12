-- The /papers listing sorts by published_date; the existing
-- [primary_source, published_date] index cannot serve a bare
-- published_date sort, so newest/oldest paged through a full scan.
CREATE INDEX "papers_published_date_idx" ON "papers"("published_date");

-- Trigram GIN indexes so the /papers free-text search
-- (title/abstract ILIKE '%q%') stops sequential-scanning the table.
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE INDEX "papers_title_idx" ON "papers" USING GIN ("title" gin_trgm_ops);
CREATE INDEX "papers_abstract_idx" ON "papers" USING GIN ("abstract" gin_trgm_ops);
