#!/usr/bin/env bash
# Isolated production server for scripts/e2e-admin.mjs: fake upstreams (scripts/fake-upstreams.mjs),
# its own DATA_DIR (./data-e2e) and port 3300 — never touches your real config or data.
# Usage: pnpm build && bash scripts/e2e-server.sh
export PORT=3300 HOST=127.0.0.1 ORIGIN=http://127.0.0.1:3300 DATA_DIR=./data-e2e NODE_ENV=production
export JELLYFIN_URL=http://localhost:8099/jellyfin JELLYFIN_API_KEY=fake-jellyfin-key
export JELLYSTAT_URL=http://localhost:8099/jellystat JELLYSTAT_API_KEY=fake-jellystat-key
export SEERR_URL=http://localhost:8099/seerr SEERR_API_KEY=fake-seerr-key
export DEEZER_API_URL=http://localhost:8099/deezer
export APP_SECRET=e2e-only-secret-0123456789abcdef0123 WRAPPED_TIMEZONE=America/Chicago BODY_SIZE_LIMIT=16M
exec node build/index.js
