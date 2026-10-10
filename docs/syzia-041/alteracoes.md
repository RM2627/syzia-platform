# SYZIA 041 — inventário de alterações

Comparação por conteúdo com o consolidado 040: **21 arquivos alterados, 515 adicionados e nenhum anterior removido**.

O inventário completo está em `alteracoes.json`. O `MANIFEST.json` da raiz é regenerado no empacotamento e contém os hashes finais. As 37 migrations anteriores, os 23 assets da marca e o lockfile foram preservados. `package.json` recebeu somente scripts locais da rodada, sem mudanças de dependências.

## Finalidade

| Área | Mudança |
|---|---|
| Banco | Somente migration 041 incremental: jornadas, preferência de horário, ajuda, anexos, perguntas, roteamento e calculadora. |
| Frontend | Navegação, wizard, consumidor, catálogo/perguntas e componente de orçamento compartilhado entre painel e Central. |
| Testes | SQL 041, regressões focadas 038/039/040 e sete fluxos de navegador; runner nativo preparado e bloqueio documentado. |
| Documentação | Diagnóstico, escopo, relatório, upgrade, matrizes, inventário e resumo de resultados. |
| Empacotamento | Nome 041, exclusões de temporários e manifesto verificável. |

## Arquivos existentes alterados

- `.gitignore`
- `AGENTS.md`
- `README.md`
- `package.json`
- `reports/phase-8-build.txt`
- `reports/phase-8-bundle-scan.json`
- `scripts/dev-consumer-demo.mjs`
- `scripts/package-project.py`
- `scripts/test-native.mjs`
- `src/FoundationApp.tsx`
- `src/access/PeopleAccess.tsx`
- `src/api.ts`
- `src/central/Central.tsx`
- `src/central/ConsumerChat.tsx`
- `src/central/central.css`
- `src/company/Company.tsx`
- `src/consumer/Consumer.tsx`
- `src/consumer/api.ts`
- `src/consumer/consumer.css`
- `src/operations/Operations.tsx`
- `tests/support/consumer-db.mjs`

## Arquivos adicionados

- `docs/syzia-041/alteracoes.json`
- `docs/syzia-041/alteracoes.md`
- `docs/syzia-041/diagnostico.md`
- `docs/syzia-041/guia-upgrade.md`
- `docs/syzia-041/matrizes.md`
- `docs/syzia-041/relatorio.md`
- `docs/syzia-041/request.md`
- `playwright.syzia041.config.ts`
- `reports/syzia-041/base-integrity.json`
- `reports/syzia-041/baseline-catalog.json`
- `reports/syzia-041/baseline-columns.json`
- `reports/syzia-041/browser.json`
- `reports/syzia-041/browser.log`
- `reports/syzia-041/build.log`
- `reports/syzia-041/bundle.log`
- `reports/syzia-041/calculadora.png`
- `reports/syzia-041/central-orcamento.png`
- `reports/syzia-041/fluxo-a-direto.png`
- `reports/syzia-041/fluxo-b-aprovado.png`
- `reports/syzia-041/fluxo-b-pretendido.png`
- `reports/syzia-041/fluxo-c-ajuda.png`
- `reports/syzia-041/format-final.log`
- `reports/syzia-041/format.log`
- `reports/syzia-041/fotos-acompanhamento.png`
- `reports/syzia-041/horario-indisponivel.png`
- `reports/syzia-041/inspect.log`
- `reports/syzia-041/migration-smoke.log`
- `reports/syzia-041/mobile-acompanhamento.png`
- `reports/syzia-041/mobile-revisao.png`
- `reports/syzia-041/native.log`
- `reports/syzia-041/regression-038.json`
- `reports/syzia-041/regression-039.json`
- `reports/syzia-041/regression-040.json`
- `reports/syzia-041/regression.log`
- `reports/syzia-041/sql.json`
- `reports/syzia-041/sql.log`
- `reports/syzia-041/validation-summary.json`
- `scripts/syzia-041/build.py`
- `scripts/syzia-041/finalize-report.py`
- `scripts/syzia-041/inspect.mjs`
- `scripts/syzia-041/journey.sql`
- `scripts/syzia-041/quotes.sql`
- `scripts/syzia-041/regression.mjs`
- `scripts/syzia-041/routing.sql`
- `scripts/syzia-041/schema.sql`
- `scripts/syzia-041/verify-base.py`
- `src/central/RequestPhotos.tsx`
- `src/consumer/Journey.tsx`
- `src/consumer/QuoteSummary.tsx`
- `src/operations/QuoteCalculator.tsx`
- `src/operations/quote-calculator.css`
- `supabase/migrations/202609260041_self_service_journeys.sql`
- `tests/demo-browser/syzia-041.spec.ts`
- `tests/syzia-041-sql.test.mjs`

Também foram adicionadas 461 definições SQL em `reports/syzia-041/baseline-functions/`, extraídas da base 040 para diagnóstico e reprodução da migration. Cada caminho consta no JSON; não são migrations adicionais.

Os relatórios antigos de build/bundle são atualizados pelo verificador existente. A evidência específica da rodada permanece em `reports/syzia-041/`. Nenhum ambiente externo foi alterado.
