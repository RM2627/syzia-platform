# Reprodução local UX-001

Usar Node 24, `npm ci` e Chromium instalado para Playwright, ou `FOUNDATION_CHROMIUM_PATH` apontando para o executável local. Somente dados sintéticos. Portas 5173/54321 livres.

```sh
node tests/ux001-security.test.mjs
node node_modules/@playwright/test/cli.js test --config=playwright.ux001.config.ts
npm run test:current-gate
```

Para medições de produção, construir com variáveis EXCLUSIVAMENTE locais:

```sh
VITE_SUPABASE_URL=http://127.0.0.1:54321 \
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_local_fixture_only \
VITE_ATTACHMENT_GATEWAY_URL=http://127.0.0.1:54321 \
VITE_PLATFORM_API_URL=http://127.0.0.1:54321 \
VITE_LOCAL_DEMO=true npm run build
node scripts/ux001/run-local.mjs scripts/ux001/measure.mjs after
node scripts/ux001/run-local.mjs scripts/ux001/perf-preservation.mjs perf-preservation
node scripts/ux001/verify.mjs
```

A comparação `before` foi feita com o dist de produção da base anterior, em fixture nova com os mesmos dados/atrasos. Para refazer: construir a base anterior com as mesmas variáveis e informar seu caminho absoluto em `AUDIT_DIST`, executando o runner atual com `scripts/ux001/measure.mjs before`. Os UUIDs da fixture são renovados a cada execução. Não usar estes endereços/valores de demo numa build de produção real.

Executar em uma cópia de trabalho se desejar conservar os relatórios que acompanham esta entrega. O gate continua produzindo sua saída em reports/syzia-044; a execução desta intervenção foi feita em cópia isolada e preservada em reports/ux001/gate-final. Nenhuma configuração de publicação é executada por estes comandos.

Integridade contra a base anterior descompactada:

```sh
python3 scripts/ux001/integrity.py /caminho/da/base-anterior/foundation
```

Não aplicar migration nova. Não executar deploy como parte desta intervenção. Feature freeze e critérios de exceção em RELATORIO-UX001-FINAL.md.
