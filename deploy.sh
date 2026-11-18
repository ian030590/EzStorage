#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"
command -v docker >/dev/null 2>&1 || { echo '請先安裝 Docker Engine 與 Docker Compose。' >&2; exit 1; }
docker compose version >/dev/null
docker info >/dev/null 2>&1 || { echo '無法連線 Docker daemon，請先啟動 Docker 並確認目前帳號有操作權限。' >&2; exit 1; }
if [[ ! -e .env ]]; then
  umask 077
  password=$(od -An -N24 -tx1 /dev/urandom | tr -d ' \n')
  # shortcut: only first-run credentials are generated here; change existing accounts in the database maintenance workflow.
  (set -o noclobber; sed "s/^ADMIN_PASSWORD=.*/ADMIN_PASSWORD=$password/" .env.example > .env)
  echo '已產生 .env（權限 600），管理者帳號為 admin@example.com，密碼請查看 .env。'
fi
docker compose config --quiet
docker compose up --build --detach --wait --wait-timeout 180
url=$(sed -n 's/^PUBLIC_URL=//p' .env | head -n 1)
printf 'EzStorage 已啟動：%s\n' "${url:-http://localhost:3000}"
echo '更新時再次執行 ./deploy.sh；停止服務：docker compose down（保留資料）。'
