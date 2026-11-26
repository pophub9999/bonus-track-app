BEGIN;
CREATE SCHEMA altzeimmer;
CREATE TABLE altzeimmer.songs (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"spotify_id" text,
"title" text NOT NULL,
"artist" text NOT NULL,
"album" text,
"release_year" int4,
"image_url" text,
"thumbnail_url" text,
"duration_ms" int4,
"isrc" text,
"spotify_url" text,
"lyrics" text,
"synced_lyrics" text,
"lyrics_source" text,
"lyrics_source_id" text,
"instrumental" bool DEFAULT false,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL,
"youtube_url" text,
"custom_url" text
);
CREATE TABLE altzeimmer.playlists (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"description" text,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE altzeimmer.setlists (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"name" text NOT NULL,
"notes" text,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE altzeimmer.song_tabs (
"id" uuid DEFAULT gen_random_uuid() NOT NULL,
"song_id" uuid NOT NULL,
"instrument" text DEFAULT 'bass'::text NOT NULL,
"source" text,
"source_song_id" text,
"source_track_index" int4,
"source_url" text,
"source_title" text,
"source_artist" text,
"source_track_name" text,
"tuning_label" text,
"is_primary" bool DEFAULT false NOT NULL,
"custom_tab" text,
"sections" jsonb DEFAULT '[]'::jsonb NOT NULL,
"created_at" timestamptz DEFAULT now() NOT NULL,
"updated_at" timestamptz DEFAULT now() NOT NULL,
"title" text,
"string_count" int4 DEFAULT 4 NOT NULL,
"is_public" bool DEFAULT false NOT NULL,
"editor_mode" text DEFAULT 'visual'::text NOT NULL
);
CREATE TABLE altzeimmer.playlist_songs (
"playlist_id" uuid NOT NULL,
"song_id" uuid NOT NULL,
"position" int4,
"added_at" timestamptz DEFAULT now() NOT NULL
);
CREATE TABLE altzeimmer.setlist_songs (
"setlist_id" uuid NOT NULL,
"song_id" uuid NOT NULL,
"position" int4 DEFAULT 1 NOT NULL,
"added_at" timestamptz DEFAULT now() NOT NULL
);
ALTER TABLE altzeimmer.playlist_songs ADD CONSTRAINT "playlist_songs_pkey" PRIMARY KEY (playlist_id, song_id);
ALTER TABLE altzeimmer.playlists ADD CONSTRAINT "playlists_pkey" PRIMARY KEY (id);
ALTER TABLE altzeimmer.setlist_songs ADD CONSTRAINT "setlist_songs_pkey" PRIMARY KEY (setlist_id, song_id);
ALTER TABLE altzeimmer.setlists ADD CONSTRAINT "setlists_pkey" PRIMARY KEY (id);
ALTER TABLE altzeimmer.song_tabs ADD CONSTRAINT "song_tabs_pkey" PRIMARY KEY (id);
ALTER TABLE altzeimmer.songs ADD CONSTRAINT "songs_pkey" PRIMARY KEY (id);
ALTER TABLE altzeimmer.songs ADD CONSTRAINT "songs_spotify_id_key" UNIQUE (spotify_id);
ALTER TABLE altzeimmer.song_tabs ADD CONSTRAINT "song_tabs_string_count_check" CHECK (((string_count >= 2) AND (string_count <= 10)));
ALTER TABLE altzeimmer.song_tabs ADD CONSTRAINT "song_tabs_editor_mode_check" CHECK ((editor_mode = ANY (ARRAY['visual'::text, 'text'::text])));
ALTER TABLE altzeimmer.song_tabs ADD CONSTRAINT "song_tabs_song_id_fkey" FOREIGN KEY (song_id) REFERENCES altzeimmer.songs(id) ON DELETE CASCADE;
ALTER TABLE altzeimmer.setlist_songs ADD CONSTRAINT "setlist_songs_song_id_fkey" FOREIGN KEY (song_id) REFERENCES altzeimmer.songs(id) ON DELETE CASCADE;
ALTER TABLE altzeimmer.setlist_songs ADD CONSTRAINT "setlist_songs_setlist_id_fkey" FOREIGN KEY (setlist_id) REFERENCES altzeimmer.setlists(id) ON DELETE CASCADE;
ALTER TABLE altzeimmer.playlist_songs ADD CONSTRAINT "playlist_songs_playlist_id_fkey" FOREIGN KEY (playlist_id) REFERENCES altzeimmer.playlists(id) ON DELETE CASCADE;
ALTER TABLE altzeimmer.playlist_songs ADD CONSTRAINT "playlist_songs_song_id_fkey" FOREIGN KEY (song_id) REFERENCES altzeimmer.songs(id) ON DELETE CASCADE;
CREATE INDEX idx_playlist_songs_playlist ON altzeimmer.playlist_songs USING btree (playlist_id, added_at);
CREATE INDEX idx_playlist_songs_song_id ON altzeimmer.playlist_songs USING btree (song_id);
CREATE INDEX idx_setlist_songs_setlist_position ON altzeimmer.setlist_songs USING btree (setlist_id, "position");
CREATE INDEX idx_setlist_songs_song ON altzeimmer.setlist_songs USING btree (song_id);
CREATE INDEX idx_song_tabs_song_instrument ON altzeimmer.song_tabs USING btree (song_id, instrument);
CREATE UNIQUE INDEX ux_song_tabs_source ON altzeimmer.song_tabs USING btree (song_id, instrument, source, source_song_id, source_track_index);
CREATE INDEX idx_songs_title_artist ON altzeimmer.songs USING btree (lower(title), lower(artist));
GRANT USAGE ON SCHEMA altzeimmer TO altzeimmer_api;
GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA altzeimmer TO altzeimmer_api;
ALTER TABLE altzeimmer.songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_library ON altzeimmer.songs FOR ALL TO altzeimmer_api USING (true) WITH CHECK (true);
ALTER TABLE altzeimmer.playlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_library ON altzeimmer.playlists FOR ALL TO altzeimmer_api USING (true) WITH CHECK (true);
ALTER TABLE altzeimmer.setlists ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_library ON altzeimmer.setlists FOR ALL TO altzeimmer_api USING (true) WITH CHECK (true);
ALTER TABLE altzeimmer.song_tabs ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_library ON altzeimmer.song_tabs FOR ALL TO altzeimmer_api USING (true) WITH CHECK (true);
ALTER TABLE altzeimmer.playlist_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_library ON altzeimmer.playlist_songs FOR ALL TO altzeimmer_api USING (true) WITH CHECK (true);
ALTER TABLE altzeimmer.setlist_songs ENABLE ROW LEVEL SECURITY;
CREATE POLICY shared_library ON altzeimmer.setlist_songs FOR ALL TO altzeimmer_api USING (true) WITH CHECK (true);
COMMIT;
