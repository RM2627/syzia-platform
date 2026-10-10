# Inventário de alterações 047

## Código e operação

As alterações são restritas a billing e ao empacotamento/execução do gate. Nenhuma migration histórica foi editada.

### Arquivos existentes alterados

- `.env.example`
- `.env.server.example`
- `.gitignore`
- `AGENTS.md`
- `README.md`
- `package.json`
- `scripts/dev-consumer-demo.mjs`
- `scripts/inspect-browser-bundle.mjs`
- `scripts/syzia-044/current-gate.mjs`
- `scripts/syzia-044/regression.mjs`
- `src/acquisition/PublicSite.tsx`
- `src/acquisition/SelfService.tsx`
- `src/billing/Billing.tsx`
- `tests/current-gate.test.mjs`
- `tests/support/current-db.mjs`
- `tests/support/current-fixture.mjs`
- `docs/testing/current-regression-gate.md`

### Novos arquivos

- `GUIA-MERCADO-PAGO-TESTE.md`
- `GUIA-UPGRADE-047.md`
- `MATRIZ-TESTES-BILLING-047.md`
- `docs/billing-047/ESTADOS-E-POLITICAS.md`
- `docs/billing-047/migrations-046-sha256.json`
- `docs/billing-047/plan-mapping.example.json`
- `playwright.billing047.config.ts`
- `reports/README.md`
- `scripts/billing-047/browser-fixture.mjs`
- `scripts/billing-047/browser-runtime.mjs`
- `scripts/billing-047/configure-plans.mjs`
- `scripts/billing-047/fixture.mjs`
- `scripts/billing-047/flexible-regression.mjs`
- `scripts/billing-047/package-clean.py`
- `scripts/billing-047/reconcile.mjs`
- `server/billing/http.mjs`
- `server/billing/mercado-pago.mjs`
- `server/billing/runtime.mjs`
- `server/billing/server.mjs`
- `server/billing/subscriptions.mjs`
- `src/billing/MercadoPago.tsx`
- `src/billing/mercado-pago.css`
- `supabase/migrations/202610050047_mercado_pago_subscriptions.sql`
- `tests/billing-047/edge-cases.test.mjs`
- `tests/billing-047/fake-provider.mjs`
- `tests/billing-047/fixture.mjs`
- `tests/billing-047/gateway.test.mjs`
- `tests/billing-047/lifecycle.test.mjs`
- `tests/billing-047/subscriptions.test.mjs`
- `tests/billing-047/upgrade.test.mjs`
- `tests/demo-browser/billing047.spec.ts`
- `RELATORIO-CHECKOUT-ASSINATURAS-047.md`
- `GATE-FINAL-047.md`
- `INVENTARIO-ALTERACOES-047.md`

## Limpeza

Origem obrigatória: `SYZIA-046-Suporte-Compartilhado-Flexivel-Consolidado.zip`, 495.256.806 bytes (472,31 MiB), 6.800 arquivos. Foram retirados do pacote 6.056 arquivos dessa origem: 6.052 saídas/evidências históricas de `reports/` e quatro manifests/resultados históricos da raiz. A base nova tem aproximadamente 13 MB; o valor exato e hash estão no registro de validação entregue com as evidências.

Também excluídos da cópia de trabalho: dependências instaladas, dist, cache do Chromium, resultados de testes da implementação, traces, logs e temporários. Eles não são contabilizados como arquivos históricos removidos da base 046. A cópia original foi preservada; a limpeza monta uma nova árvore, não apaga indiscriminadamente a origem.

Preservados: frontend/backend, package/lock, configurações e exemplos de ambiente, scripts, public/assets/brand, cadeia integral de migrations, todos os testes e fixtures históricos, novos testes de billing, contratos/hashes e guias operacionais. Em `reports/`, oito JSON necessários a verificadores existentes e um README. A lista de exclusão completa e comparações SHA-256 ficam em `limpeza-047.json` no pacote separado.

O gate não depende de resultados anteriores. O contrato de preservação continua verificando 165 hashes históricos de testes/migrations e o mapa de 108 falhas históricas; deixa de exigir cópias dos resultados brutos. Casos legados de trial são explicitamente fixtures offline; os casos 047 validam runtime real sem concessão de trial pelo navegador.

## Reprodução

`scripts/billing-047/package-clean.py` cria staging novo fora do source e ZIP com inventário. Não remove ou consolida migrations. A validação é executada em uma extração independente desse ZIP, sem compartilhar node_modules/dist/cache com a árvore original.
