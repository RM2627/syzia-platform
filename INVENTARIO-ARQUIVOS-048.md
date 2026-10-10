# Inventário de arquivos — SYZIA 048

Comparação com a base limpa 047. Nenhum arquivo da base original foi removido; somente resultados gerados no trabalho são excluídos do pacote.

## Alterados

- `.env.example`
- `.env.server.example`
- `AGENTS.md`
- `README.md`
- `docs/testing/current-regression-gate.md`
- `package.json`
- `reports/README.md`
- `scripts/billing-047/fixture.mjs`
- `scripts/dev-consumer-demo.mjs`
- `scripts/syzia-044/current-gate.mjs`
- `scripts/syzia-044/regression.mjs`
- `server/attachments.mjs`
- `server/billing/http.mjs`
- `server/billing/server.mjs`
- `server/platform.mjs`
- `src/FoundationApp.tsx`
- `src/api.ts`
- `src/central/Central.tsx`
- `src/commercial/Config.tsx`
- `src/company/Company.tsx`
- `src/operations/Onboarding.tsx`
- `tests/billing-047/fixture.mjs`

## Adicionados

- `docs/syzia-048/http-contracts.md`

- `server/unified.mjs`
- `scripts/syzia-048/fixture.mjs`
- `playwright.syzia048.config.ts`
- `supabase/migrations/202610090048_unified_backend_optional_manual.sql`
- `tests/syzia-048/unified.test.mjs`
- `tests/syzia-048/manual.test.mjs`
- `tests/syzia-048/integrity.test.mjs`
- `tests/demo-browser/syzia-048.spec.ts`
- `docs/syzia-048/escopo.md`
- `docs/syzia-048/preserved-047-sha256.json`
- `GUIA-HOSPEDAGEM-PORTA-UNICA.md`
- `GUIA-UPGRADE-048.md`
- `PENDENCIAS-HOMOLOGACAO-048.md`
- `MATRIZ-TESTES-SYZIA-048.md`
- `RELATORIO-SYZIA-048.md`
- `RESULTADO-GATE-048.md`
- `INVENTARIO-ARQUIVOS-048.md`

## Preservação

- Migrations 001–047: 43 arquivos, hashes idênticos; 048 acrescentada sem renumeração.
- `package-lock.json` e dependências: intactos. Somente scripts adicionados ao `package.json`.
- Núcleo 047: `mercado-pago.mjs`, `subscriptions.mjs` e `runtime.mjs` intactos; mudanças HTTP são composição de handlers.
- Testes históricos preservados. Fixtures/runners atuais carregam 048; adaptação explícita de três expectativas antigas do checklist, descrita na matriz.
- Fonte frontend/backend, assets, public, configs, guias e oito entradas JSON de reports preservados.
- Fora do ZIP: node_modules, dist, caches, outputs de testes, logs, screenshots, traces e arquivos temporários. Evidências atuais em pacote separado.
