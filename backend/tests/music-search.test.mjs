import test from 'node:test';
import assert from 'node:assert/strict';
globalThis.Deno={env:{get:name=>name==='SUPABASE_ANON_KEY'?'test-key':undefined}};
const {default:handler}=await import('../dist/music-search.js');
const realFetch=globalThis.fetch;
const request=(q,key='test-key')=>new Request('https://example.test/functions/v1/music-search?'+new URLSearchParams({q,limit:'5',market:'PT'}),{headers:{apikey:key}});
test('iTunes maps metadata, keeps source IDs separate, and shares cached requests',async()=>{
 let calls=0;
 globalThis.fetch=async(url)=>{calls++;assert.equal(new URL(url).hostname,'itunes.apple.com');return Response.json({results:[{kind:'song',trackId:123,trackName:'Hysteria',artistName:'Muse',collectionName:'Absolution',releaseDate:'2003-01-01',trackTimeMillis:227000,trackViewUrl:'https://music.apple.com/pt/album/test/123',artworkUrl100:'https://example.test/cover.jpg'},{kind:'music-video',trackId:456}]});};
 try {
  const responses=await Promise.all([handler(request('Muse Hysteria')),handler(request('Muse Hysteria'))]);
  const data=await responses[0].json();
  assert.equal(data.tracks.length,1);assert.equal(data.tracks[0].id,'itunes:123');assert.equal(data.tracks[0].source,'itunes');assert.equal(data.tracks[0].spotifyUrl,null);assert.equal(data.tracks[0].year,'2003');
  await handler(request('Muse Hysteria'));assert.equal(calls,1);
 } finally {globalThis.fetch=realFetch;}
});
test('unauthorized and short queries never reach the catalogue',async()=>{
 globalThis.fetch=async()=>{throw Error('Must not fetch');};
 try {assert.equal((await handler(request('Muse','wrong'))).status,401);assert.deepEqual((await (await handler(request('x'))).json()).tracks,[]);}
 finally {globalThis.fetch=realFetch;}
});
test('upstream error gives a usable message',async()=>{
 globalThis.fetch=async()=>new Response('',{status:429});
 try {const r=await handler(request('rate limit fixture'));assert.equal(r.status,502);assert.match((await r.json()).error,/Aguarda um minuto/);}
 finally {globalThis.fetch=realFetch;}
});
test('live iTunes catalogue returns songs without credentials',{skip:!process.env.LIVE_ITUNES},async()=>{
 globalThis.fetch=realFetch;
 const r=await handler(request('Muse Hysteria'));assert.equal(r.status,200);
 const d=await r.json();assert.ok(d.tracks.length);assert.ok(d.tracks.every(t=>t.source==='itunes'));
});
