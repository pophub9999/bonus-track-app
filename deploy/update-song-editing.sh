#!/usr/bin/env bash
set -euo pipefail
umask 077

source_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
backend=/opt/altzeimmer-backend
library=functions/library.ts
sql=sql/song-links-lyrics.sql
compose=(docker compose --project-directory "$backend" -p altzeimmer-backend -f "$backend/compose.yml")

test -s "$backend/.env"
test -s "$backend/$library"
test -s "$source_root/backend/$library"
test -s "$source_root/backend/$sql"
docker inspect altzeimmer-api >/dev/null
previous_image=$(docker inspect --format '{{.Image}}' altzeimmer-api)
running=$(docker ps --format '{{.Names}}')
mapfile -t databases < <(printf '%s\n' "$running" | grep '^db-40wra5594y70lv92qgstkyyz-' || true)
if [[ ${#databases[@]} != 1 ]]; then
  echo 'Não foi possível identificar com segurança o PostgreSQL de produção.' >&2
  exit 1
fi
database=${databases[0]}
backup=$(mktemp -d /opt/altzeimmer-backups/pre-song-editing.XXXXXXXX)
cp -p -- "$backend/$library" "$backup/library.ts"
docker exec "$database" pg_dump -U postgres -d postgres -n altzeimmer -Fc > "$backup/database.dump"
docker exec -i "$database" pg_restore --list < "$backup/database.dump" > "$backup/database.list"
grep -Eq 'TABLE DATA altzeimmer songs ' "$backup/database.list"
echo "Cópia verificada em $backup"

docker exec -i "$database" psql -X -U postgres -d postgres -v ON_ERROR_STOP=1 < "$source_root/backend/$sql"

restore_api() {
  cp -p -- "$backup/library.ts" "$backend/$library"
  docker image tag "$previous_image" altzeimmer-backend:local
  "${compose[@]}" up -d --no-deps --no-build --force-recreate api
}

dataset_check='fetch("http://127.0.0.1:8080/functions/v1/library?action=songs",{headers:{apikey:"altzeimmer-public"},signal:AbortSignal.timeout(5000)}).then(async r=>{if(!r.ok||!Array.isArray((await r.json()).songs))process.exitCode=1}).catch(()=>{process.exitCode=1})'
cp -- "$source_root/backend/$library" "$backend/$library"
if "${compose[@]}" build api && "${compose[@]}" up -d --no-deps --no-build api; then
  for attempt in {1..12}; do
    if docker exec altzeimmer-api node -e "$dataset_check" 2>/dev/null; then
      echo 'API atualizada. A leitura das músicas foi verificada.'
      exit 0
    fi
    sleep 2
  done
fi

echo 'A verificação da API falhou. A repor o contentor anterior.' >&2
restore_api
exit 1
