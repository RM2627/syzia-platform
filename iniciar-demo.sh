#!/usr/bin/env sh
set -eu
cd "$(dirname "$0")"
command -v node >/dev/null || { echo 'Instale Node.js 22.12 ou superior com npm. Consulte README.md.'; exit 1; }
command -v npm >/dev/null || { echo 'npm não encontrado. Reinstale Node.js incluindo npm.'; exit 1; }
if [ ! -d node_modules ]; then npm ci; fi
exec npm run dev:demo
