# Altzeimmer — produção

Website: https://altzeimmer.nextit.freeddns.org

Projeto e aplicação Altzeimmer no Coolify. Branch de publicação: codex/vps-public-library. Build Dockerfile, porta 80, healthcheck /health.

O frontend chama /functions/v1 no mesmo domínio. O Nginx encaminha esses pedidos para altzeimmer-api:8080 na rede coolify. A API e o PostgREST estão em /opt/altzeimmer-backend, geridos por Docker Compose; os dados ficam no esquema altzeimmer do Supabase Postgres existente no VPS. Ver backend/README.md.

A origem Supabase gerida foi pausada após comparar o conteúdo integral das seis tabelas. Não reintroduzir URLs da origem no frontend. Backups do corte e dump PostgreSQL estão em /opt/altzeimmer-backups, com acesso restrito.

As pesquisas Spotify e LRCLIB correm pelo backend no VPS. O Songsterr pode recusar pesquisa automática; a interface oferece abertura direta da pesquisa e mantém as referências já guardadas.

O endereço anterior bonus-track.185.174.252.117.sslip.io redireciona para o domínio principal através do serviço /opt/altzeimmer-legacy-redirect.
