BEGIN;
ALTER TABLE altzeimmer.songs ADD COLUMN IF NOT EXISTS youtube_urls text[];
ALTER TABLE altzeimmer.songs ADD COLUMN IF NOT EXISTS spotify_urls text[];
UPDATE altzeimmer.songs SET youtube_urls = CASE WHEN nullif(trim(youtube_url), '') IS NULL THEN ARRAY[]::text[] ELSE ARRAY[youtube_url] END WHERE youtube_urls IS NULL;
UPDATE altzeimmer.songs SET spotify_urls = CASE WHEN nullif(trim(spotify_url), '') IS NULL THEN ARRAY[]::text[] ELSE ARRAY[spotify_url] END WHERE spotify_urls IS NULL;
ALTER TABLE altzeimmer.songs ALTER COLUMN youtube_urls SET DEFAULT ARRAY[]::text[], ALTER COLUMN youtube_urls SET NOT NULL;
ALTER TABLE altzeimmer.songs ALTER COLUMN spotify_urls SET DEFAULT ARRAY[]::text[], ALTER COLUMN spotify_urls SET NOT NULL;
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'altzeimmer.songs'::regclass AND conname = 'songs_youtube_urls_max') THEN
        ALTER TABLE altzeimmer.songs ADD CONSTRAINT songs_youtube_urls_max CHECK (cardinality(youtube_urls) <= 3);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'altzeimmer.songs'::regclass AND conname = 'songs_spotify_urls_max') THEN
        ALTER TABLE altzeimmer.songs ADD CONSTRAINT songs_spotify_urls_max CHECK (cardinality(spotify_urls) <= 3);
    END IF;
END
$$;
NOTIFY pgrst, 'reload schema';
COMMIT;
