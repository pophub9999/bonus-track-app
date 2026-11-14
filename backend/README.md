# Altzeimmer no Supabase do VPS

Os dados usam o esquema altzeimmer no Postgres da instalação Supabase existente. PostgREST e a API têm contentores próprios; os acessos à base limitam-se ao esquema da aplicação, com RLS ativo. A API serve as mesmas operações das funções originais e mantém Spotify, LRCLIB e Songsterr como fontes de importação.

O frontend usa /functions/v1 no mesmo domínio. Nenhuma chave administrativa é enviada ao browser. A configuração .env fica apenas no servidor. O serviço backend corre com docker compose -p altzeimmer-backend up -d --build. A rede externa supabase do compose deve corresponder à instalação existente.

schema.sql cria o esquema vazio uma única vez. Antes de importar, guardar backup integral das seis tabelas e preservar todos os IDs. Nunca executar schema.sql novamente sobre um esquema já populado.
