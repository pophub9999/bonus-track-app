# Pesquisa iTunes e reversão Spotify

A pesquisa ativa usa /functions/v1/music-search, com resultados iTunes e cache de cinco minutos. Pedidos ao catálogo são espaçados em 3,4 segundos, com fila limitada. Não são usados tokens Spotify nem previews de áudio.

O código Spotify original foi preservado integralmente em functions/spotify-search.ts. A sua importação está desativada/comentada no server.mjs. O endereço antigo /functions/v1/spotify-search encaminha temporariamente para iTunes, para páginas em cache continuarem a funcionar.

Para reativar Spotify: carregar o handler original no server.mjs, atribuí-lo a handlers['music-search'], reativar os textos e a constante comentada no App.js, confirmar SPOTIFY_CLIENT_ID e SPOTIFY_CLIENT_SECRET no .env do servidor, e recompilar backend e website. Não apagar catalog_source/catalog_id: identificam as músicas já importadas por iTunes.

Antes da primeira publicação, aplicar sql/itunes-catalog.sql ao Supabase do VPS. Apenas acrescenta três colunas e um índice; não altera IDs, tabs ou associações existentes. O importador reutiliza IDs iTunes existentes e tenta ligar gravações Spotify com título/artista/álbum iguais e duração com diferença máxima de dois segundos, preservando spotify_id e spotify_url.

As capas e os resultados apresentam ligação para a página correspondente na iTunes Store. Não são descarregados ficheiros de áudio.
