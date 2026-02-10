-- Full-text search setup for SearchChunk table
-- Run after `db:push`: npm run db:search-setup

-- GIN index on the tsvector column for fast full-text search
CREATE INDEX IF NOT EXISTS "SearchChunk_searchVector_idx"
  ON "SearchChunk" USING GIN ("searchVector");

-- Trigger function: auto-populate searchVector on insert/update
-- Headings get weight A (highest), content gets weight B
CREATE OR REPLACE FUNCTION search_chunk_vector_update() RETURNS trigger AS $$
BEGIN
  NEW."searchVector" :=
    setweight(to_tsvector('english', COALESCE(NEW."sectionHeading", '')), 'A') ||
    setweight(to_tsvector('english', COALESCE(NEW."content", '')), 'B');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS search_chunk_vector_trigger ON "SearchChunk";
CREATE TRIGGER search_chunk_vector_trigger
  BEFORE INSERT OR UPDATE OF "content", "sectionHeading"
  ON "SearchChunk"
  FOR EACH ROW
  EXECUTE FUNCTION search_chunk_vector_update();

-- Backfill existing rows (safe to re-run)
UPDATE "SearchChunk" SET "searchVector" =
  setweight(to_tsvector('english', COALESCE("sectionHeading", '')), 'A') ||
  setweight(to_tsvector('english', COALESCE("content", '')), 'B')
WHERE "searchVector" IS NULL;
