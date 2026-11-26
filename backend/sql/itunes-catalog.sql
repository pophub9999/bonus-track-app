BEGIN;
ALTER TABLE altzeimmer.songs ADD COLUMN IF NOT EXISTS catalog_source text;
ALTER TABLE altzeimmer.songs ADD COLUMN IF NOT EXISTS catalog_id text;
ALTER TABLE altzeimmer.songs ADD COLUMN IF NOT EXISTS catalog_url text;
CREATE UNIQUE INDEX IF NOT EXISTS ux_songs_catalog ON altzeimmer.songs(catalog_source,catalog_id);
COMMIT;
NOTIFY pgrst, 'reload schema';
