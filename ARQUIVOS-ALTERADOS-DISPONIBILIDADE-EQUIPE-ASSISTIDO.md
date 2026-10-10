# Arquivos alterados — disponibilidade da equipe e Assistido

Comparação SHA-256 contra o ZIP consolidado 044/UX001 fornecido. Todos os arquivos originais estão presentes. As 40 migrations anteriores, os relatórios históricos e o lockfile permanecem byte a byte. Não houve alteração em assets, AuthProvider, UX-002 ou arquivos de asserções históricas. Os dois helpers de teste alterados constam abaixo.

## 16 arquivos originais alterados

| Arquivo | Finalidade |
|---|---|
| `AGENTS.md` | Registra a exceção autorizada e a parada após entrega. |
| `docs/testing/current-regression-gate.md` | Documenta a inclusão aditiva da 045 e a fixture fictícia. |
| `package.json` | Acrescenta comandos de testes focados e navegador; lockfile intacto. |
| `scripts/dev-consumer-demo.mjs` | Aplica a 045 na demo descartável e adapta RPC/JSON dos novos comandos. |
| `scripts/syzia-044/current-gate.mjs` | Acrescenta upgrade, casos focados e navegador 045 ao mesmo gate. |
| `scripts/syzia-044/regression.mjs` | Executa as asserções históricas com a 045; configura fixtures depois do snapshot de upgrade. |
| `src/api.ts` | Traduz causas de indisponibilidade e política compartilhada. |
| `src/billing/Billing.tsx` | Mostra configuração global ou consulta empresarial; substitui a apresentação do limite mensal antigo. |
| `src/billing/PlanEditor.tsx` | Retira edição do contador mensal antigo; dados históricos e outros campos permanecem. |
| `src/central/ConsumerChat.tsx` | Exibe informação fora do horário sem bloquear a composição da mensagem. |
| `src/central/model.ts` | Mensagens específicas para horário, quota e responsável. |
| `src/consumer/api.ts` | Mensagem pública simples para indisponibilidade. |
| `src/operations/Operations.tsx` | Responsável opcional na ficha existente da Agenda. |
| `src/permissions/Permissions.tsx` | Editor de disponibilidade a partir da resposta agregada existente. |
| `tests/support/current-db.mjs` | Carrega a migration 045 para o gate atual. |
| `tests/support/current-fixture.mjs` | Carrega a fixture 045 nos cenários atuais. |

## Código e testes novos

| Arquivo | Finalidade |
|---|---|
| `supabase/migrations/202610030045_team_availability_assisted.sql` | Disponibilidade, responsável, integração ao motor atual, política, ciclos, consumo, auditoria e comandos autorizados. |
| `src/availability/Availability.tsx` | Editor semanal, indisponibilidade pontual, política global e consumo. |
| `src/availability/availability.css` | Disposição responsiva dos campos novos. |
| `scripts/team-availability/fixture.mjs` | Dados exclusivamente fictícios para executar regressões operacionais. |
| `tests/team-availability.test.mjs` | 29 cenários focados E/S. |
| `tests/team-availability-upgrade.test.mjs` | Upgrade populado sem reset e defaults seguros. |
| `tests/demo-browser/team-availability.spec.ts` | Oito cenários desktop/mobile, autorização e requests agregadas. |
| `playwright.team-availability.config.ts` | Execução e evidência dos novos cenários de navegador. |

## Documentação e evidências novas

- `RELATORIO-DISPONIBILIDADE-EQUIPE-ASSISTIDO.md`: resultado, decisões de implementação, unidade de consumo, limitações e pendências do proprietário.
- `ARQUIVOS-ALTERADOS-DISPONIBILIDADE-EQUIPE-ASSISTIDO.md`: este inventário.
- `docs/team-availability/`: pedido integral, guias de atualização/configuração, matriz de testes, comparação de desempenho, hashes da base, integridade e diff dos arquivos originais alterados.
- `reports/team-availability/`: casos focados, upgrade, gate atual, logs, capturas, traces e medições. `current-gate/` preserva as saídas desta execução antes de restaurar os relatórios históricos.
- `MANIFEST-DISPONIBILIDADE-EQUIPE-ASSISTIDO.json`: lista completa dos arquivos do consolidado e hashes SHA-256, exceto o próprio manifesto.

O projeto completo inclui todos os arquivos da base e os acréscimos acima. `node_modules`, builds locais de teste, caches e cópias temporárias de testes não integram a entrega; dependências são reproduzidas por `npm ci`. Os oito traces novos estão em `reports/team-availability/traces/`. Nenhum teste foi retirado da execução para obter PASS.

A evidência final é `reports/team-availability/current-gate.json`. Os JSON/logs históricos com datas anteriores continuam preservados como histórico. Logs de diagnóstico registram tentativas anteriores e não substituem o resultado final aprovado.
