import http from 'node:http';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  for (let attempt=0; ; attempt++) {
    try { return await originalFetch(...args); }
    catch(error) {
      if (error.cause?.code !== 'EAI_AGAIN' || attempt >= 2) throw error;
      await new Promise(resolve => setTimeout(resolve, 300 * (attempt+1)));
    }
  }
};
globalThis.Deno = { env: { get: (name) => process.env[name] } };
const handlers = Object.fromEntries(await Promise.all(['library','music-search','tab-search'].map(async name => [name,(await import('./dist/'+name+'.js')).default])));
// Spotify desativado; para reativar, importar './dist/spotify-search.js' neste ponto.
// Compatibilidade com páginas antigas em cache: encaminha para iTunes, nunca para Spotify.
handlers['spotify-search'] = handlers['music-search'];
const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url,'http://altzeimmer-api:8080');
    if (url.pathname === '/health') { res.writeHead(200); res.end('ok'); return; }
    if (url.pathname.startsWith('/rest/v1/')) {
      const upstream = new URL(url.pathname.slice('/rest/v1'.length)+url.search,'http://rest:3000');
      const response = await fetch(upstream,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
      res.writeHead(response.status,Object.fromEntries(response.headers));res.end(Buffer.from(await response.arrayBuffer()));return;
    }
    const name = url.pathname.split('/')[3];
    if (!url.pathname.startsWith('/functions/v1/') || !handlers[name]) { res.writeHead(404);res.end();return; }
    const request = new Request(url,{method:req.method,headers:req.headers,...(!['GET','HEAD'].includes(req.method)?{body:req,duplex:'half'}:{})});
    const response = await handlers[name](request);
    res.writeHead(response.status,Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  } catch(error) { console.error(error.message);res.writeHead(500,{'Content-Type':'application/json'});res.end(JSON.stringify({error:'Não foi possível executar o pedido.'})); }
});
server.listen(8080,'0.0.0.0');
