# Inventário — correção final UX-001

Base: SYZIA-044-UX-Final-Consolidado. A entrega é o projeto completo. Não há exclusões de arquivos da base nem migration nova.

## Produto: três arquivos existentes e um novo

| Arquivo | Mudança |
|---|---|
| `src/FoundationApp.tsx` | Identidade de Atendimento/Pendências por empresa e área; Comercial por empresa. Nenhuma alteração fora de CompanyRoute. |
| `src/central/Central.tsx` | URLs conforme origem, escopo empresarial fixo, resposta vinculada à empresa, link Voltar à fila. |
| `src/commercial/Commercial.tsx` | Oportunidade e ticket conservam origem empresarial; rotas globais mantidas. |
| `src/central/navigation.ts` — novo | Helper pequeno de URL de ticket para contexto empresarial/global. |

Diff legível: `reports/ux001/source-diff.patch`. Não substitui o código completo incluído no ZIP.

## Gate e documentação existentes atualizados

- `scripts/syzia-044/current-gate.mjs`: acrescenta SQL focado e navegador UX-001 em fixture independente; conserva todas as etapas anteriores.
- `docs/testing/current-regression-gate.md`: documenta a cobertura adicional.
- `AGENTS.md` e `README.md`: registram escopo, entrega e feature freeze.
- `UX-AGUARDANDO-APROVACAO.md`: nota de decisão posterior; texto histórico preservado.
- `MANIFEST.json`: inventário integral regenerado para o novo pacote. Manifest da base guardado em `reports/ux001/base-MANIFEST.json`.

## Novos testes, scripts e documentos

- `tests/demo-browser/ux001.spec.ts`: 10 cenários, navegação/histórico/filtros, 1440/390/320 px, origens, autorização e notificações.
- `tests/ux001-security.test.mjs`: seis cenários SQL de autorização/revogação/isolamento.
- `playwright.ux001.config.ts`: execução focada independente.
- `scripts/ux001/run-local.mjs`, `harness.mjs`, `measure.mjs`: fixture local, build de produção, requests/frames/traces antes × depois.
- `scripts/ux001/perf-preservation.mjs`: verificações selecionadas das otimizações já entregues.
- `scripts/ux001/verify.mjs`, `integrity.py`, `report.mjs`, `final-report.py`: comparação automática, integridade e relatórios reproduzíveis.
- `docs/ux001/request.md`: pedido integral aprovado; `docs/ux001/reproduction.md`: comandos e limites de reprodução local.
- `RELATORIO-UX001-FINAL.md`, `MATRIZ-ANTES-DEPOIS-UX001.md`, `RESULTADO-GATE-UX001.json` e este inventário.
- `reports/ux001/`: resultados, logs, traces, capturas, integridade, comparação e gate final. Tentativas iniciais de preparação estão identificadas separadamente.

## Preservados

40 migrations; 11 arquivos de servidor; todos os 136 arquivos de testes anteriores; todos os 3.190 arquivos de evidências anteriores. Lockfile e package.json não alterados. AuthProvider, login, ContextChooser, termos, inatividade, verificação, revalidação e todas as fontes fora das três listadas acima foram preservados.

Nenhum node_modules, dist de medição, cache de teste ou segredo real é distribuído. Evidências selecionadas foram copiadas dos diretórios temporários para `reports/ux001/`; os testes e os relatórios originais da base permanecem completos.
