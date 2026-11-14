# Bonus Track no Coolify

Acesso público, sem login. Biblioteca e tabs partilhadas.

## Publicação

Criar aplicação a partir deste repositório e selecionar Dockerfile, porta interna 80 e health check /health. Não publicar a porta diretamente na internet; usar o proxy HTTPS do Coolify. Definir o domínio no painel após configurar o DNS.

Build arguments: EXPO_PUBLIC_SUPABASE_URL e EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY. Nunca usar service_role no frontend.

Esta primeira fase coloca o website no VPS e mantém o Supabase original como backend, preservando IDs e tabs. Não cria nem esvazia bases de dados. A migração do backend para o VPS fica pendente de exportação e validação dos dados originais.

## Recuperação dos dados

Antes de migrar: exportar songs, song_tabs, playlists, playlist_songs, setlists e setlist_songs; preservar IDs e relações; comparar contagens e conteúdo JSON das tabs após importação. Guardar backups fora do repositório público. Não apagar nem pausar a origem até validar a cópia.

As funções Supabase versionadas em supabase/functions são cópias do código publicado, sem segredos. Dependem do esquema e da função get_spotify_credentials existentes na origem.
