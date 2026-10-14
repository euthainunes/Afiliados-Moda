#!/usr/bin/env bash
# Teste de restauração: gera um dump lógico do banco, restaura numa base temporária no mesmo servidor
# e confere se tudo voltou (contagem de linhas por tabela, migrações e livro-razão balanceado).
#
# Uso:   scripts/backup-restore-check.sh [URL_DO_BANCO] [PASTA_DO_DUMP]
#        (sem URL, usa DATABASE_URL; sem pasta, usa ./backups)
# Requer: pg_dump, pg_restore e psql da mesma versão principal do servidor, e permissão CREATEDB
#         para o usuário (em produção, rode contra uma CÓPIA/réplica ou com um usuário de manutenção).
# O dump contém dados pessoais: guarde-o criptografado e apague-o conforme a política de retenção.
set -euo pipefail

SOURCE_URL="${1:-${DATABASE_URL:-}}"
OUT_DIR="${2:-./backups}"
if [[ -z "$SOURCE_URL" ]]; then echo "Informe a URL do banco (argumento ou DATABASE_URL)." >&2; exit 2; fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
dump="$OUT_DIR/afiliados-$stamp.dump"

# Mesma URL, trocando só o nome do banco (preserva usuário, senha, host e parâmetros como sslmode).
base="${SOURCE_URL%%\?*}"
query=""
[[ "$SOURCE_URL" == *\?* ]] && query="?${SOURCE_URL#*\?}"
source_db="${base##*/}"
restore_db="restauracao_teste_${stamp,,}"
restore_url="${base%/*}/${restore_db}${query}"
admin_url="${base%/*}/postgres${query}"

cleanup() { psql "$admin_url" -qAt -c "drop database if exists \"$restore_db\"" >/dev/null 2>&1 || true; }
trap cleanup EXIT

echo "1/4 Gerando dump de '$source_db'…"
pg_dump --format=custom --no-owner --no-privileges --file="$dump" "$SOURCE_URL"
chmod 600 "$dump"
echo "    $(du -h "$dump" | cut -f1) em $dump"

echo "2/4 Restaurando em '$restore_db'…"
psql "$admin_url" -qAt -c "create database \"$restore_db\"" >/dev/null
pg_restore --no-owner --no-privileges --exit-on-error --dbname="$restore_url" "$dump"

counts() {
  psql "$1" -qAt -F' ' <<'SQL'
select format('select %L, count(*) from %I.%I', table_name, table_schema, table_name)
from information_schema.tables
where table_schema = 'public' and table_type = 'BASE TABLE'
order by table_name
\gexec
SQL
}

echo "3/4 Comparando contagens por tabela…"
diff_out="$(diff <(counts "$SOURCE_URL") <(counts "$restore_url") || true)"
tables="$(counts "$restore_url" | wc -l | tr -d ' ')"
if [[ -n "$diff_out" ]]; then echo "DIVERGÊNCIA entre origem e restauração:"; echo "$diff_out"; exit 1; fi
echo "    $tables tabelas idênticas"

echo "4/4 Conferindo integridade da cópia…"
migrations_src="$(psql "$SOURCE_URL" -qAt -c 'select count(*) from drizzle.__drizzle_migrations')"
migrations_dst="$(psql "$restore_url" -qAt -c 'select count(*) from drizzle.__drizzle_migrations')"
unbalanced="$(psql "$restore_url" -qAt -c 'select count(*) from (select transaction_id from ledger_entries group by transaction_id having sum(amount_cents) <> 0) t')"
if [[ "$migrations_src" != "$migrations_dst" ]]; then echo "Migrações divergentes: $migrations_src × $migrations_dst"; exit 1; fi
if [[ "$unbalanced" != "0" ]]; then echo "Livro-razão desbalanceado na cópia: $unbalanced transação(ões)"; exit 1; fi
echo "    $migrations_dst migrações; livro-razão balanceado"

echo "OK: restauração verificada em $(date -u +%FT%TZ). Registre este resultado no checklist de produção."
echo "Lembrete: ALTER DATABASE ... SET app.environment não faz parte do dump; reaplique ao restaurar produção."
