
import { createClient } from "@supabase/supabase-js";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isAuthorized(req: Request) {
  const supplied = req.headers.get("apikey") ?? "";
  if (!supplied) return false;

  const publishableRaw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (publishableRaw) {
    try {
      const keys = JSON.parse(publishableRaw);
      if (Object.values(keys).includes(supplied)) return true;
    } catch {}
  }

  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY");
  return Boolean(legacyAnon && supplied === legacyAnon);
}

function getAdminClient() {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (secretKeysRaw) {
    try {
      const keys = JSON.parse(secretKeysRaw);
      adminKey = keys.default ?? adminKey;
    } catch {}
  }

  if (!adminKey) throw new Error("Supabase admin key unavailable");

  return createClient(Deno.env.get("SUPABASE_URL")!, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'altzeimmer' },
  });
}

function norm(value: string | null | undefined) {
  return (value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\([^)]*\)|\[[^\]]*\]/g, " ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function chooseLyricsMatch(items: any[], song: any) {
  const wantedTitle = norm(song.title);
  const wantedArtist = norm(song.artist);
  const wantedDuration = Math.round(Number(song.duration_ms ?? 0) / 1000);

  const scored = items.map((item) => {
    const itemTitle = norm(item.trackName ?? item.name);
    const itemArtist = norm(item.artistName);
    const itemDuration = Number(item.duration ?? 0);
    let score = 0;

    if (itemTitle === wantedTitle) score += 60;
    else if (itemTitle.includes(wantedTitle) || wantedTitle.includes(itemTitle)) score += 25;

    if (itemArtist === wantedArtist) score += 35;
    else if (itemArtist.includes(wantedArtist) || wantedArtist.includes(itemArtist)) score += 18;

    if (wantedDuration && itemDuration) {
      const diff = Math.abs(wantedDuration - itemDuration);
      if (diff <= 2) score += 25;
      else if (diff <= 5) score += 12;
      else if (diff > 15) score -= 20;
    }

    return { item, score };
  }).sort((a, b) => b.score - a.score);

  return scored[0]?.score >= 70 ? scored[0].item : null;
}

async function fetchLyrics(song: any) {
  const headers = {
    "User-Agent": "BonusTrack/0.2 (https://github.com/pophub9999/bonus-track-app)",
    "Lrclib-Client": "BonusTrack/0.2 (https://github.com/pophub9999/bonus-track-app)",
    "Accept": "application/json",
  };

  const exact = new URL("https://lrclib.net/api/get");
  exact.searchParams.set("track_name", song.title);
  exact.searchParams.set("artist_name", song.artist);
  if (song.album) exact.searchParams.set("album_name", song.album);
  const duration = Math.round(Number(song.duration_ms ?? 0) / 1000);
  if (duration > 0 && duration <= 3600) exact.searchParams.set("duration", String(duration));

  try {
    const response = await fetch(exact, { headers });

    if (response.ok) {
      const data = await response.json();
      return {
        lyrics: data.plainLyrics ?? null,
        syncedLyrics: data.syncedLyrics ?? null,
        source: "LRCLIB",
        sourceId: data.id ? String(data.id) : null,
        instrumental: Boolean(data.instrumental),
      };
    }

    if (response.status === 429) {
      return { lyrics: null, syncedLyrics: null, source: "LRCLIB", sourceId: null, instrumental: false, rateLimited: true };
    }
  } catch (error) {
    console.error("LRCLIB exact lookup failed", error);
  }

  try {
    const search = new URL("https://lrclib.net/api/search");
    search.searchParams.set("track_name", song.title);
    search.searchParams.set("artist_name", song.artist);

    const response = await fetch(search, { headers });
    if (!response.ok) return null;

    const items = await response.json();
    const match = chooseLyricsMatch(Array.isArray(items) ? items : [], song);
    if (!match) return null;

    return {
      lyrics: match.plainLyrics ?? null,
      syncedLyrics: match.syncedLyrics ?? null,
      source: "LRCLIB",
      sourceId: match.id ? String(match.id) : null,
      instrumental: Boolean(match.instrumental),
    };
  } catch (error) {
    console.error("LRCLIB search lookup failed", error);
    return null;
  }
}

async function enrichLyrics(supabase: any, song: any) {
  if (song.lyrics || song.instrumental) return song;

  const lyrics = await fetchLyrics(song);
  if (!lyrics || lyrics.rateLimited) return song;

  const patch = {
    lyrics: lyrics.lyrics,
    synced_lyrics: lyrics.syncedLyrics,
    lyrics_source: lyrics.source,
    lyrics_source_id: lyrics.sourceId,
    instrumental: lyrics.instrumental,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("songs")
    .update(patch)
    .eq("id", song.id)
    .select("*")
    .single();

  if (error) {
    console.error("Failed saving lyrics", error);
    return { ...song, ...patch };
  }

  return data;
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const supabase = getAdminClient();
    const url = new URL(req.url);

    if (req.method === "GET") {
      const action = url.searchParams.get("action") ?? "songs";

      if (action === "songs") {
        const { data, error } = await supabase
          .from("songs")
          .select("*")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return json({ songs: data ?? [] });
      }

      if (action === "setlists") {
        const { data, error } = await supabase
          .from("setlists")
          .select("id,name,notes,created_at,updated_at,setlist_songs(song_id)")
          .order("updated_at", { ascending: false });
        if (error) throw error;

        const setlists = (data ?? []).map((item: any) => ({
          id: item.id,
          name: item.name,
          notes: item.notes,
          created_at: item.created_at,
          updated_at: item.updated_at,
          song_count: item.setlist_songs?.length ?? 0,
        }));

        return json({ setlists });
      }

      if (action === "setlist_songs") {
        const setlistId = url.searchParams.get("setlistId");
        if (!setlistId) return json({ error: "setlistId is required" }, 400);

        const { data: setlist, error: setlistError } = await supabase
          .from("setlists")
          .select("id,name,notes,created_at,updated_at")
          .eq("id", setlistId)
          .single();
        if (setlistError) throw setlistError;

        const { data, error } = await supabase
          .from("setlist_songs")
          .select("position,added_at,song:songs(*)")
          .eq("setlist_id", setlistId)
          .order("position", { ascending: true })
          .order("added_at", { ascending: true });
        if (error) throw error;

        return json({
          setlist,
          songs: (data ?? [])
            .filter((row: any) => row.song)
            .map((row: any) => ({ ...row.song, setlist_position: row.position })),
        });
      }

      if (action === "playlists") {
        const { data, error } = await supabase
          .from("playlists")
          .select("id,name,description,created_at,playlist_songs(song_id)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        const playlists = (data ?? []).map((p: any) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          created_at: p.created_at,
          song_count: p.playlist_songs?.length ?? 0,
        }));
        return json({ playlists });
      }

      if (action === "tabs") {
        const songId = url.searchParams.get("songId");
        const instrument = url.searchParams.get("instrument") ?? "bass";
        if (!songId) return json({ error: "songId is required" }, 400);

        const { data, error } = await supabase
          .from("song_tabs")
          .select("*")
          .eq("song_id", songId)
          .eq("instrument", instrument)
          .order("is_primary", { ascending: false })
          .order("created_at", { ascending: true });
        if (error) throw error;

        return json({ tabs: data ?? [] });
      }

      if (action === "playlist_songs") {
        const playlistId = url.searchParams.get("playlistId");
        if (!playlistId) return json({ error: "playlistId is required" }, 400);

        const { data: playlist, error: playlistError } = await supabase
          .from("playlists")
          .select("id,name,description")
          .eq("id", playlistId)
          .single();
        if (playlistError) throw playlistError;

        const { data, error } = await supabase
          .from("playlist_songs")
          .select("position,added_at,song:songs(*)")
          .eq("playlist_id", playlistId)
          .order("position", { ascending: true, nullsFirst: false })
          .order("added_at", { ascending: true });
        if (error) throw error;

        return json({
          playlist,
          songs: (data ?? []).map((row: any) => row.song).filter(Boolean),
        });
      }

      return json({ error: "Unknown action" }, 400);
    }

    if (req.method === "POST") {
      const body = await req.json();
      const action = body?.action;

      if (action === "add_song") {
        const input = body?.song;
        if (!input?.title || !input?.artist) return json({ error: "Invalid song" }, 400);

        const payload = {
          spotify_id: input.id ?? input.spotify_id ?? null,
          title: input.title,
          artist: input.artist,
          album: input.album ?? null,
          release_year: input.year ? Number(input.year) : null,
          image_url: input.image ?? input.image_url ?? null,
          thumbnail_url: input.thumbnail ?? input.thumbnail_url ?? null,
          duration_ms: input.durationMs ?? input.duration_ms ?? null,
          isrc: input.isrc ?? null,
          spotify_url: input.spotifyUrl ?? input.spotify_url ?? null,
          updated_at: new Date().toISOString(),
        };

        let song;
        if (payload.spotify_id) {
          const { data, error } = await supabase
            .from("songs")
            .upsert(payload, { onConflict: "spotify_id" })
            .select("*")
            .single();
          if (error) throw error;
          song = data;
        } else {
          const { data, error } = await supabase
            .from("songs")
            .insert(payload)
            .select("*")
            .single();
          if (error) throw error;
          song = data;
        }

        const enriched = await enrichLyrics(supabase, song);
        return json({ song: enriched, lyricsFound: Boolean(enriched.lyrics || enriched.instrumental) });
      }

      if (action === "update_song") {
        const songId = body?.songId;
        const fields = body?.fields ?? {};
        if (!songId) return json({ error: "songId is required" }, 400);

        const allowed = {
          title: typeof fields.title === "string" ? fields.title.trim() : undefined,
          artist: typeof fields.artist === "string" ? fields.artist.trim() : undefined,
          album: typeof fields.album === "string" ? fields.album.trim() || null : undefined,
          release_year: fields.year === "" || fields.year == null
            ? (fields.year === "" ? null : undefined)
            : Number(fields.year),
          youtube_url: typeof fields.youtubeUrl === "string"
            ? (fields.youtubeUrl.trim() || null)
            : undefined,
          custom_url: typeof fields.customUrl === "string"
            ? (fields.customUrl.trim() || null)
            : undefined,
          updated_at: new Date().toISOString(),
        };

        if (!allowed.title || !allowed.artist) {
          return json({ error: "Title and artist are required" }, 400);
        }

        const patch = Object.fromEntries(
          Object.entries(allowed).filter(([, value]) => value !== undefined)
        );

        const { data, error } = await supabase
          .from("songs")
          .update(patch)
          .eq("id", songId)
          .select("*")
          .single();
        if (error) throw error;

        return json({ song: data });
      }

      if (action === "delete_song") {
        const songId = body?.songId;
        if (!songId) return json({ error: "songId is required" }, 400);

        const { data: song, error: songError } = await supabase
          .from("songs")
          .select("id,title,artist")
          .eq("id", songId)
          .single();

        if (songError) throw songError;

        const { error } = await supabase
          .from("songs")
          .delete()
          .eq("id", songId);

        if (error) throw error;

        return json({ ok: true, song });
      }

      if (action === "create_manual_tab") {
        const songId = body?.songId;
        const instrument = body?.instrument ?? "bass";
        if (!songId) return json({ error: "songId is required" }, 400);

        const { data: existing, error: existingError } = await supabase
          .from("song_tabs")
          .select("*")
          .eq("song_id", songId)
          .eq("instrument", instrument)
          .eq("source", "Manual")
          .order("created_at", { ascending: true })
          .limit(1);

        if (existingError) throw existingError;
        if (existing?.[0]) return json({ tab: existing[0] });

        const { data, error } = await supabase
          .from("song_tabs")
          .insert({
            song_id: songId,
            instrument,
            source: "Manual",
            source_track_name:
              instrument === "bass" ? "Baixo"
              : instrument === "guitar" ? "Guitarra"
              : instrument === "drums" ? "Bateria"
              : instrument === "keys" ? "Teclas"
              : instrument,
            title:
              instrument === "bass" ? "Minha tab de baixo"
              : instrument === "guitar" ? "Minha tab de guitarra"
              : instrument === "drums" ? "Minha tab de bateria"
              : instrument === "keys" ? "Minha tab de teclas"
              : "Minha tab",
            string_count:
              instrument === "drums" ? 8
              : instrument === "keys" ? 2
              : instrument === "guitar" ? 6
              : 4,
            is_primary: false,
            sections: [],
            updated_at: new Date().toISOString(),
          })
          .select("*")
          .single();

        if (error) throw error;
        return json({ tab: data }, 201);
      }

      if (action === "save_tab_reference") {
        const songId = body?.songId;
        const instrument = body?.instrument ?? "bass";
        const result = body?.result ?? {};
        const track = body?.track ?? {};
        if (!songId || !result?.songId) return json({ error: "Invalid tab reference" }, 400);

        await supabase
          .from("song_tabs")
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq("song_id", songId)
          .eq("instrument", instrument);

        const payload = {
          song_id: songId,
          instrument,
          source: "Songsterr",
          source_song_id: String(result.songId),
          source_track_index: Number(track.index ?? 0),
          source_url: result.songsterrUrl ?? result.searchUrl ?? null,
          source_title: result.title ?? null,
          source_artist: result.artist ?? null,
          source_track_name: track.name ?? track.instrument ?? null,
          tuning_label: track.tuningLabel ?? null,
          title:
            (result.title ? String(result.title) : "Tab") + " - " +
            (instrument === "bass" ? "Baixo"
              : instrument === "guitar" ? "Guitarra"
              : instrument === "drums" ? "Bateria"
              : instrument === "keys" ? "Teclas"
              : instrument),
          string_count:
            Array.isArray(track.tuning) && track.tuning.length >= 2 && track.tuning.length <= 10
              ? track.tuning.length
              : instrument === "drums" ? 8
              : instrument === "keys" ? 2
              : instrument === "guitar" ? 6
              : 4,
          editor_mode: "visual",
          is_primary: true,
          updated_at: new Date().toISOString(),
        };

        const { data, error } = await supabase
          .from("song_tabs")
          .upsert(payload, { onConflict: "song_id,instrument,source,source_song_id,source_track_index" })
          .select("*")
          .single();
        if (error) throw error;

        return json({ tab: data });
      }

      if (action === "set_primary_tab") {
        const tabId = body?.tabId;
        if (!tabId) return json({ error: "tabId is required" }, 400);

        const { data: chosen, error: chosenError } = await supabase
          .from("song_tabs")
          .select("id,song_id,instrument")
          .eq("id", tabId)
          .single();
        if (chosenError) throw chosenError;

        await supabase
          .from("song_tabs")
          .update({ is_primary: false, updated_at: new Date().toISOString() })
          .eq("song_id", chosen.song_id)
          .eq("instrument", chosen.instrument);

        const { data, error } = await supabase
          .from("song_tabs")
          .update({ is_primary: true, updated_at: new Date().toISOString() })
          .eq("id", tabId)
          .select("*")
          .single();
        if (error) throw error;

        return json({ tab: data });
      }

      if (action === "save_tab_content") {
        const tabId = body?.tabId;
        if (!tabId) return json({ error: "tabId is required" }, 400);

        const sections = Array.isArray(body?.sections) ? body.sections : [];
        const customTab = typeof body?.customTab === "string" ? body.customTab : null;
        const title = typeof body?.title === "string" ? body.title.trim() : undefined;
        const stringCount = Number(body?.stringCount);
        const isPublic = typeof body?.isPublic === "boolean" ? body.isPublic : undefined;
        const editorMode = body?.editorMode === "text" ? "text" : "visual";

        const patch = {
          custom_tab: customTab,
          sections,
          editor_mode: editorMode,
          updated_at: new Date().toISOString(),
        } as Record<string, unknown>;

        if (title !== undefined) patch.title = title || null;
        if (Number.isInteger(stringCount) && stringCount >= 2 && stringCount <= 10) patch.string_count = stringCount;
        if (isPublic !== undefined) patch.is_public = isPublic;

        const { data, error } = await supabase
          .from("song_tabs")
          .update(patch)
          .eq("id", tabId)
          .select("*")
          .single();
        if (error) throw error;

        return json({ tab: data });
      }

      if (action === "retry_lyrics") {
        const songId = body?.songId;
        if (!songId) return json({ error: "songId is required" }, 400);

        const { data: song, error } = await supabase
          .from("songs")
          .select("*")
          .eq("id", songId)
          .single();
        if (error) throw error;

        const enriched = await enrichLyrics(supabase, { ...song, lyrics: null, instrumental: false });
        return json({ song: enriched, lyricsFound: Boolean(enriched.lyrics || enriched.instrumental) });
      }

      if (action === "create_setlist") {
        const name = String(body?.name ?? "").trim();
        if (!name) return json({ error: "Setlist name is required" }, 400);

        const { data, error } = await supabase
          .from("setlists")
          .insert({
            name,
            notes: typeof body?.notes === "string" ? body.notes.trim() || null : null,
            updated_at: new Date().toISOString(),
          })
          .select("id,name,notes,created_at,updated_at")
          .single();
        if (error) throw error;

        return json({ setlist: { ...data, song_count: 0 } }, 201);
      }

      if (action === "add_to_setlist") {
        const setlistId = body?.setlistId;
        const songId = body?.songId;
        if (!setlistId || !songId) return json({ error: "setlistId and songId are required" }, 400);

        const { count, error: countError } = await supabase
          .from("setlist_songs")
          .select("*", { count: "exact", head: true })
          .eq("setlist_id", setlistId);
        if (countError) throw countError;

        const { error } = await supabase
          .from("setlist_songs")
          .upsert({
            setlist_id: setlistId,
            song_id: songId,
            position: Number(count ?? 0) + 1,
          }, { onConflict: "setlist_id,song_id", ignoreDuplicates: true });
        if (error) throw error;

        await supabase
          .from("setlists")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", setlistId);

        return json({ ok: true });
      }

      if (action === "remove_from_setlist") {
        const setlistId = body?.setlistId;
        const songId = body?.songId;
        if (!setlistId || !songId) return json({ error: "setlistId and songId are required" }, 400);

        const { error } = await supabase
          .from("setlist_songs")
          .delete()
          .eq("setlist_id", setlistId)
          .eq("song_id", songId);
        if (error) throw error;

        const { data: remaining, error: remainingError } = await supabase
          .from("setlist_songs")
          .select("song_id")
          .eq("setlist_id", setlistId)
          .order("position", { ascending: true })
          .order("added_at", { ascending: true });
        if (remainingError) throw remainingError;

        for (let i = 0; i < (remaining ?? []).length; i += 1) {
          const row = remaining![i];
          const { error: updateError } = await supabase
            .from("setlist_songs")
            .update({ position: i + 1 })
            .eq("setlist_id", setlistId)
            .eq("song_id", row.song_id);
          if (updateError) throw updateError;
        }

        await supabase
          .from("setlists")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", setlistId);

        return json({ ok: true });
      }

      if (action === "reorder_setlist") {
        const setlistId = body?.setlistId;
        const songIds = Array.isArray(body?.songIds) ? body.songIds.filter(Boolean) : [];
        if (!setlistId || !songIds.length) {
          return json({ error: "setlistId and songIds are required" }, 400);
        }

        const uniqueSongIds = [...new Set(songIds.map((id: unknown) => String(id)))];

        const { data: existing, error: existingError } = await supabase
          .from("setlist_songs")
          .select("song_id")
          .eq("setlist_id", setlistId);
        if (existingError) throw existingError;

        const existingIds = new Set((existing ?? []).map((row: any) => String(row.song_id)));
        if (uniqueSongIds.length !== existingIds.size || uniqueSongIds.some((id: string) => !existingIds.has(id))) {
          return json({ error: "The supplied order does not match the setlist" }, 400);
        }

        for (let i = 0; i < uniqueSongIds.length; i += 1) {
          const { error: updateError } = await supabase
            .from("setlist_songs")
            .update({ position: i + 1 })
            .eq("setlist_id", setlistId)
            .eq("song_id", uniqueSongIds[i]);
          if (updateError) throw updateError;
        }

        await supabase
          .from("setlists")
          .update({ updated_at: new Date().toISOString() })
          .eq("id", setlistId);

        return json({ ok: true });
      }

      if (action === "delete_setlist") {
        const setlistId = body?.setlistId;
        if (!setlistId) return json({ error: "setlistId is required" }, 400);

        const { error } = await supabase
          .from("setlists")
          .delete()
          .eq("id", setlistId);
        if (error) throw error;

        return json({ ok: true });
      }

      if (action === "delete_playlist") {
        const playlistId = body?.playlistId;
        if (!playlistId) return json({ error: "playlistId is required" }, 400);
        const { error } = await supabase.from("playlists").delete().eq("id", playlistId);
        if (error) throw error;
        return json({ ok: true });
      }

      if (action === "create_playlist") {
        const name = String(body?.name ?? "").trim();
        if (!name) return json({ error: "Playlist name is required" }, 400);

        const { data, error } = await supabase
          .from("playlists")
          .insert({ name, description: body?.description ?? null })
          .select("id,name,description,created_at")
          .single();
        if (error) throw error;
        return json({ playlist: { ...data, song_count: 0 } }, 201);
      }

      if (action === "add_to_playlist") {
        const playlistId = body?.playlistId;
        const songId = body?.songId;
        if (!playlistId || !songId) return json({ error: "playlistId and songId are required" }, 400);

        const { count } = await supabase
          .from("playlist_songs")
          .select("*", { count: "exact", head: true })
          .eq("playlist_id", playlistId);

        const { error } = await supabase
          .from("playlist_songs")
          .upsert({
            playlist_id: playlistId,
            song_id: songId,
            position: Number(count ?? 0) + 1,
          }, { onConflict: "playlist_id,song_id", ignoreDuplicates: true });
        if (error) throw error;

        return json({ ok: true });
      }

      if (action === "remove_from_playlist") {
        const playlistId = body?.playlistId;
        const songId = body?.songId;
        if (!playlistId || !songId) return json({ error: "playlistId and songId are required" }, 400);

        const { error } = await supabase
          .from("playlist_songs")
          .delete()
          .eq("playlist_id", playlistId)
          .eq("song_id", songId);
        if (error) throw error;
        return json({ ok: true });
      }

      return json({ error: "Unknown action" }, 400);
    }

    return json({ error: "Method not allowed" }, 405);
  } catch (error) {
    console.error(error);
    const message =
      error instanceof Error
        ? error.message
        : (error && typeof error === "object" && "message" in error)
          ? String((error as { message?: unknown }).message || "Unexpected error")
          : "Unexpected error";
    return json({ error: message }, 500);
  }
}
