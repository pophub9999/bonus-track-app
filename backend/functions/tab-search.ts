

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "apikey, authorization, content-type, x-client-info",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
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

  const raw = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  if (raw) {
    try {
      const keys = JSON.parse(raw);
      if (Object.values(keys).includes(supplied)) return true;
    } catch {}
  }

  const legacyAnon = Deno.env.get("SUPABASE_ANON_KEY");
  return Boolean(legacyAnon && supplied === legacyAnon);
}

const instrumentDefs: Record<string, { pattern: RegExp; fallbackName: string; urlInst: string }> = {
  bass: {
    pattern: /\bbass\b|baixo|electric bass|acoustic bass/i,
    fallbackName: "Bass",
    urlInst: "bass",
  },
  guitar: {
    pattern: /guitar|guitarra|acoustic guitar|electric guitar/i,
    fallbackName: "Guitar",
    urlInst: "guitar",
  },
  drums: {
    pattern: /drum|drums|bateria|percussion|percuss/i,
    fallbackName: "Drums",
    urlInst: "drums",
  },
  keys: {
    pattern: /keyboard|piano|keys|organ|synth/i,
    fallbackName: "Keyboard",
    urlInst: "keyboard",
  },
};

function trackMatches(track: any, instrument: string) {
  const def = instrumentDefs[instrument] ?? instrumentDefs.bass;
  const text = `${track?.instrument ?? ""} ${track?.name ?? ""}`;
  return def.pattern.test(text);
}

function midiNoteName(n: number) {
  const names = ["C","C#","D","D#","E","F","F#","G","G#","A","A#","B"];
  if (!Number.isFinite(n)) return String(n);
  const octave = Math.floor(n / 12) - 1;
  return `${names[((n % 12) + 12) % 12]}${octave}`;
}

function slugify(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function scoreResult(item: any, q: string, instrument: string) {
  const wanted = q.toLowerCase();
  const title = String(item?.title ?? "").toLowerCase();
  const artist = String(item?.artist ?? "").toLowerCase();
  let score = 0;

  if (wanted.includes(title) || title.includes(wanted)) score += 40;
  for (const part of wanted.split(/\s+/).filter(Boolean)) {
    if (title.includes(part)) score += 3;
    if (artist.includes(part)) score += 2;
  }

  score += (item?.tracks ?? [])
    .filter((track: any) => trackMatches(track, instrument))
    .reduce((sum: number, t: any) => sum + Math.log10(Number(t?.views ?? 0) + 10), 0);

  return score;
}

export default async function handler(req: Request) {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders });
  }

  if (req.method !== "GET") return json({ error: "Method not allowed" }, 405);
  if (!isAuthorized(req)) return json({ error: "Unauthorized" }, 401);

  try {
    const url = new URL(req.url);
    const q = (url.searchParams.get("q") ?? "").trim();
    const requestedInstrument = (url.searchParams.get("instrument") ?? "bass").toLowerCase();
    const instrument = instrumentDefs[requestedInstrument] ? requestedInstrument : "bass";
    const def = instrumentDefs[instrument];

    if (q.length < 2) return json({ results: [], instrument });

    const endpoint = new URL("https://www.songsterr.com/api/songs");
    endpoint.searchParams.set("pattern", q);
    endpoint.searchParams.set("size", "10");

    const response = await fetch(endpoint, {
      headers: {
        Accept: "application/json",
        "User-Agent": "BonusTrack/0.4 non-commercial personal practice app (+https://github.com/pophub9999/bonus-track-app)",
      },
    });

    if (!response.ok) {
      console.error("Songsterr search failed", response.status, await response.text());
      return json({ error: response.status === 403 ? "O Songsterr não permite a pesquisa automática a partir deste servidor. Usa a opção Abrir pesquisa no Songsterr." : "Não foi possível pesquisar no Songsterr.", status: response.status }, 502);
    }

    const payload = await response.json();
    const items = Array.isArray(payload) ? payload : (payload?.items ?? payload?.records ?? []);

    const results = items
      .map((item: any) => {
        const tracks = (item?.tracks ?? [])
          .map((track: any, index: number) => ({ track, index }))
          .filter(({ track }: any) => trackMatches(track, instrument))
          .map(({ track, index }: any) => ({
            index,
            name: track?.name ?? def.fallbackName,
            instrument: track?.instrument ?? def.fallbackName,
            instrumentId: track?.instrumentId ?? null,
            tuning: Array.isArray(track?.tuning) ? track.tuning : [],
            tuningLabel: Array.isArray(track?.tuning)
              ? track.tuning.map((n: number) => midiNoteName(n)).join(" · ")
              : "",
            difficulty: track?.difficulty ?? null,
            views: track?.views ?? null,
            hash: track?.hash ?? null,
          }));

        return {
          songId: item?.songId ?? item?.id ?? null,
          artistId: item?.artistId ?? null,
          artist: item?.artist ?? "",
          title: item?.title ?? "",
          hasPlayer: Boolean(item?.hasPlayer),
          tracks,
          bassTracks: instrument === "bass" ? tracks : [],
          songsterrUrl: item?.songId
            ? `https://www.songsterr.com/a/wsa/${slugify(String(item?.artist ?? ""))}-${slugify(String(item?.title ?? ""))}-tab-s${item.songId}`
            : null,
          searchUrl: `https://www.songsterr.com/?inst=${encodeURIComponent(def.urlInst)}&pattern=${encodeURIComponent(`${item?.artist ?? ""} ${item?.title ?? ""}`)}`,
          score: scoreResult(item, q, instrument),
        };
      })
      .filter((item: any) => item.tracks.length > 0)
      .sort((a: any, b: any) => b.score - a.score)
      .slice(0, 5)
      .map(({ score, ...item }: any) => item);

    return json({ query: q, instrument, results });
  } catch (error) {
    console.error(error);
    return json({ error: error instanceof Error ? error.message : "Unexpected error" }, 500);
  }
}
