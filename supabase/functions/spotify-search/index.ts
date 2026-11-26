import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
};

let cachedToken = "";
let tokenExpiresAt = 0;

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json; charset=utf-8" },
  });
}

function isAuthorized(req: Request) {
  const supplied = req.headers.get("apikey") ?? "";
  if (!supplied) return false;

  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (Object.values(keys).includes(supplied)) return true;
    } catch {
      // fall through to legacy key check
    }
  }

  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY");
  return Boolean(legacyAnon && supplied === legacyAnon);
}

async function getSpotifyCredentials() {
  const secretKeysRaw = Deno.env.get("SUPABASE_SECRET_KEYS");
  let adminKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (secretKeysRaw) {
    try {
      const keys = JSON.parse(secretKeysRaw);
      adminKey = keys.default ?? adminKey;
    } catch {
      // keep legacy fallback
    }
  }

  if (!adminKey) throw new Error("Supabase admin key unavailable");

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, adminKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data, error } = await supabase.rpc("get_spotify_credentials");
  if (error) throw error;
  if (!data?.client_id || !data?.client_secret) {
    throw new Error("Spotify credentials are not configured");
  }

  return {
    clientId: data.client_id as string,
    clientSecret: data.client_secret as string,
  };
}

async function getSpotifyToken() {
  const now = Date.now();
  if (cachedToken && now < tokenExpiresAt - 60_000) return cachedToken;

  const { clientId, clientSecret } = await getSpotifyCredentials();
  const basic = btoa(`${clientId}:${clientSecret}`);

  const res = await fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: "grant_type=client_credentials",
  });

  if (!res.ok) {
    const detail = await res.text();
    console.error("Spotify token error", res.status, detail);
    throw new Error(`Spotify authentication failed (${res.status})`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = now + Number(data.expires_in ?? 3600) * 1000;
  return cachedToken;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const limit = Math.min(Math.max(Number(url.searchParams.get("limit") ?? 10), 1), 10);
    const market = (url.searchParams.get("market") ?? "PT").toUpperCase();

    if (q.length < 2) return json({ tracks: [] });

    const token = await getSpotifyToken();
    const params = new URLSearchParams({
      q,
      type: "track",
      limit: String(limit),
      market,
    });

    const res = await fetch(`https://api.spotify.com/v1/search?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!res.ok) {
      const detail = await res.text();
      console.error("Spotify search error", res.status, detail);
      return json({ error: "Spotify search failed", status: res.status }, 502);
    }

    const data = await res.json();
    const tracks = (data.tracks?.items ?? []).map((track: any) => ({
      id: track.id,
      title: track.name,
      artists: (track.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
      artist: (track.artists ?? []).map((a: any) => a.name).join(", "),
      album: track.album?.name ?? "",
      albumId: track.album?.id ?? null,
      releaseDate: track.album?.release_date ?? null,
      year: track.album?.release_date ? String(track.album.release_date).slice(0, 4) : null,
      image: track.album?.images?.[0]?.url ?? null,
      thumbnail: track.album?.images?.[2]?.url ?? track.album?.images?.[1]?.url ?? track.album?.images?.[0]?.url ?? null,
      durationMs: track.duration_ms ?? null,
      explicit: Boolean(track.explicit),
      isrc: track.external_ids?.isrc ?? null,
      spotifyUrl: track.external_urls?.spotify ?? null,
      uri: track.uri ?? null,
      popularity: track.popularity ?? null,
    }));

    return json({
      query: q,
      market,
      total: data.tracks?.total ?? tracks.length,
      tracks,
    });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
});
