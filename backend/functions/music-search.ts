// Catálogo ativo: iTunes Search API. Spotify permanece em spotify-search.ts, desativado.
const headers = {'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'apikey, authorization, content-type','Access-Control-Allow-Methods':'GET, OPTIONS','Content-Type':'application/json; charset=utf-8'};
const cache = new Map();
const inFlight = new Map();
let queue = Promise.resolve();
let lastRequest = 0;
let pending = 0;
const json = (body, status=200) => new Response(JSON.stringify(body),{status,headers});
function authorized(req) {
  const key=req.headers.get('apikey') || '';
  if (!key) return false;
  if(key===Deno.env.get('SUPABASE_ANON_KEY')) return true;
  try { return Object.values(JSON.parse(Deno.env.get('SUPABASE_PUBLISHABLE_KEYS') || '{}')).includes(key); } catch { return false; }
}
async function lookup(q,country,limit) {
  if(pending>=6) throw new Error('Há várias pesquisas em curso. Aguarda alguns segundos.');
  pending++;
  const task=queue.then(async()=>{
    await new Promise(resolve=>setTimeout(resolve,Math.max(0,3400-(Date.now()-lastRequest))));
    lastRequest=Date.now();
    const url=new URL('https://itunes.apple.com/search');
    url.search=new URLSearchParams({term:q,country,media:'music',entity:'song',limit:String(limit)}).toString();
    const response=await fetch(url,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(15000)});
    if(!response.ok) throw new Error(response.status===429?'O catálogo está ocupado. Aguarda um minuto e tenta novamente.':'Não foi possível consultar o catálogo iTunes ('+response.status+').');
    const data=await response.json();
    const tracks=(data.results || []).filter(t=>t.kind==='song' && t.trackId && t.trackName && t.artistName).map(t=>({
      id:'itunes:'+t.trackId,source:'itunes',catalogId:String(t.trackId),
      title:t.trackName,artist:t.artistName,album:t.collectionName || '',
      year:t.releaseDate ? t.releaseDate.slice(0,4) : null,
      image:t.artworkUrl100 || t.artworkUrl60 || null,thumbnail:t.artworkUrl60 || t.artworkUrl100 || null,
      durationMs:t.trackTimeMillis || null,catalogUrl:t.trackViewUrl || null,
      spotifyUrl:null,isrc:null
    }));
    return {query:q,market:country,source:'itunes',total:tracks.length,tracks};
  });
  queue=task.then(()=>undefined,()=>undefined);
  try {return await task;} finally {pending--;}
}
export default async function handler(req) {
  if(req.method==='OPTIONS') return new Response(null,{status:204,headers});
  if(req.method!=='GET') return json({error:'Method not allowed'},405);
  if(!authorized(req)) return json({error:'Unauthorized'},401);
  const url=new URL(req.url);
  const q=(url.searchParams.get('q') || '').trim().slice(0,200);
  const country=/^[A-Za-z]{2}$/.test(url.searchParams.get('market') || '')?url.searchParams.get('market').toUpperCase():'PT';
  const n=Number(url.searchParams.get('limit') || 10);
  const limit=Number.isFinite(n)?Math.max(1,Math.min(25,Math.floor(n))):10;
  if(q.length<2) return json({source:'itunes',tracks:[],total:0});
  const key=JSON.stringify([q.toLowerCase(),country,limit]);
  const saved=cache.get(key);
  if(saved && saved.expires>Date.now()) return json(saved.data);
  try {
    let task=inFlight.get(key);
    if(!task) {
      task=lookup(q,country,limit);
      inFlight.set(key,task);
      task.finally(()=>{if(inFlight.get(key)===task)inFlight.delete(key);}).catch(()=>{});
    }
    const data=await task;
    if(cache.size>=100) cache.delete(cache.keys().next().value);
    cache.set(key,{expires:Date.now()+300000,data});
    return json(data);
  } catch(error) {return json({error:error.message || 'Não foi possível pesquisar músicas.'},502);}
}
