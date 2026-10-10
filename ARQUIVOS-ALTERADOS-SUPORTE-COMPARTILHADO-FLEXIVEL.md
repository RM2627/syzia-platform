# Inventário de alterações — 046

Base comparada por SHA-256: `SYZIA-045-Disponibilidade-Equipe-Assistido-Consolidado.zip`, 6.533 arquivos originais. A lista integral de hashes de entrada está em `docs/flexible-support/baseline-045-sha256.json`.

## Arquivos originais alterados

| Arquivo | Motivo |
|---|---|
| `AGENTS.md` | Autorização específica 046 e parada após entrega. |
| `README.md` | Entrada vigente com relatório, upgrade e gate 046; histórico mantido. |
| `docs/testing/current-regression-gate.md` | Documenta as três etapas aditivas e as evidências atuais. |
| `package.json` | Comandos focados 046; dependências/lockfile intactos. |
| `scripts/dev-consumer-demo.mjs` | Aplica 046 à demo local após a configuração 045. |
| `scripts/syzia-044/current-gate.mjs` | Acrescenta SQL/upgrade/browser 046 e habilita fixture atual. |
| `scripts/syzia-044/regression.mjs` | Executa assertions históricas na 046; preparação de data local no caso de métricas 042-46. |
| `src/acquisition/PublicSite.tsx` | Benefício e descrição conforme disponibilidade, preservando conteúdo/preço do plano. |
| `src/api.ts` | Mensagens de erro para presença e política. |
| `src/availability/Availability.tsx` | Seletor de modo; campos programados condicionais; consumo/regras em leitura; auditoria. |
| `src/billing/Billing.tsx` | Terminologia e descrição do benefício compartilhado. |
| `src/billing/Capabilities.tsx` | Rótulo da capability existente. |
| `src/billing/PlanEditor.tsx` | Rótulo e explicação correta do consumo da 045. |
| `src/central/Central.tsx` | Estado aguardando apoio; presença existente controla novas assunções; destinatários indisponíveis identificados. |
| `src/central/model.ts` | Erro claro de presença/política, sem alteração do fluxo. |
| `src/operations/Onboarding.tsx` | Terminologia de apoio compartilhado. |
| `tests/support/current-db.mjs` | Aplica 046 às fixtures atuais mediante flag do gate. |
| `tests/support/current-fixture.mjs` | Aplica 046 às fixtures atuais mediante flag do gate. |

## Novos arquivos de implementação e verificação

| Arquivo | Finalidade |
|---|---|
| `supabase/migrations/202610030046_flexible_shared_support.sql` | Coluna do modo e reutilização das funções/presença existentes; transacional. |
| `src/availability/support-copy.ts` | Textos compartilhados da UI. |
| `scripts/flexible-support/fixture.mjs` | Aplicação incremental local da 046, sem configuração comercial. |
| `tests/support/flexible-db.mjs` | Preparação isolada da base 045 e comandos autorizados. |
| `tests/flexible-support.test.mjs` | Vinte casos SQL novos. |
| `tests/flexible-support-upgrade.test.mjs` | Preservação de 125 tabelas e dez funções críticas. |
| `tests/demo-browser/flexible-support.spec.ts` | Nove cenários de UI e capturas desktop/mobile. |
| `playwright.flexible-support.config.ts` | Execução focada, sem retries, com traces. |

## Documentação e evidências novas

- `RELATORIO-SUPORTE-COMPARTILHADO-FLEXIVEL.md`: resultado, decisões, antes/depois, validação e limites.
- Este inventário e `MANIFEST-SUPORTE-COMPARTILHADO-FLEXIVEL.json`: arquivos completos e hashes do consolidado, exceto o próprio manifest.
- `docs/flexible-support/`: pedido integral, hashes da base, configuração, upgrade, matriz, textos, comparação de desempenho e índice de evidências.
- `reports/flexible-support/`: resultados finais, logs, capturas, traces, gate atual e diagnósticos identificados. `integrity.json` registra a preservação; `history-preservation.json` lista cada evidência copiada e cada relatório histórico restaurado.

Nenhum arquivo original foi removido. As 41 migrations históricas, todas as assertions de testes históricos, lockfile, AuthProvider, UX-001 e assets permanecem byte a byte. Somente os dois helpers de fixture indicados acima foram alterados entre os testes originais. Os novos testes são aditivos.

Como o runner usa caminhos históricos, as saídas atuais foram copiadas para `reports/flexible-support/current-gate/` antes de restaurar os bytes dos relatórios da 045. Para arquivos derivados individuais, consulte a enumeração completa no manifest; a entrega contém o projeto inteiro, não apenas estas alterações.
