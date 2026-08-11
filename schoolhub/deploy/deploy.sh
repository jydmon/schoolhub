#!/usr/bin/env bash
# Pulls the latest code, installs, builds and reloads SIPlat under PM2.
# Run from the app root (or via: bash deploy/deploy.sh). Schema changes are NOT
# applied automatically — see the guide's "Updating the database" section.
set -euo pipefail
cd "$(dirname "$0")/.."
echo "→ Pulling latest from GitHub"
git pull --ff-only origin main
echo "→ Installing dependencies"
npm ci
echo "→ Building (prisma generate + next build)"
npm run build
echo "→ Reloading under PM2"
pm2 reload ecosystem.config.js --update-env || pm2 start ecosystem.config.js
pm2 save
echo "✔ Deploy complete"
