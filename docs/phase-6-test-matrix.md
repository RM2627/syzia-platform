# Matriz de testes — Fase 6

**TESTADO LOCALMENTE**: PGlite/SQL real com Auth/claims simulados e navegador Chromium. **PENDENTE DE HOMOLOGAÇÃO EXTERNA**: Supabase real, JWT/PostgREST/Storage e concorrência de conexões independentes. Os interleavings seriais abaixo não são prova de corrida real.

Todos os números referem-se aos nomes em `tests/commercial.test.mjs`, cujo resultado final está em `reports/commercial-results.json` (54/54). Regressão cumulativa e deduplicação em `reports/phase-6-summary.json`.

| Nº do requisito | Controle obrigatório | Casos locais / evidências |
|---:|---|---|
| 1 | Isolamento A/B | 01, 32, 34; UI link de B e troca de contexto |
| 2 | Atendente sem vínculo | 02, 38 |
| 3 | Empresa suspensa | 03; regressão consumidor/Central |
| 4 | Atendente revogado | 04, 37; UI sessão aberta |
| 5 | Tarefa duplicada | 05; índice parcial e unicidade de ciclo |
| 6 | Duas assunções concorrentes | 06 em série; runner HTTP/SQL independente preparado, execução externa pendente |
| 7 | Execução concorrente | 07, 33 em série; corrida independente pendente |
| 8 | Revisão obsoleta | 08, 16, 33; UI cliente respondeu |
| 9 | Regra específica sobre serviço | 09 |
| 10 | Serviço sobre empresa | 10 |
| 11 | Empresa sobre padrão | 11, 12 |
| 12 | Limite de tentativas | 13, 41, 48 |
| 13 | Consentimento ausente | 14 |
| 14 | Consentimento revogado | 15 |
| 15 | Cliente respondeu antes do retorno | 16; UI interrupção de retorno |
| 16 | Orçamento aprovado antes do retorno | 17, 49 |
| 17 | Orçamento recusado | 18 |
| 18 | Conversão | 19, 30, 49, 51; upgrade com agendamento direto histórico |
| 19 | Perda | 20, 26, 44 |
| 20 | Reabertura por novo interesse | 21; oportunidade anterior preservada |
| 21 | Horário permitido | 22, 47 |
| 22 | Fuso | 23 |
| 23 | Tarefa atrasada | 24; UI lista |
| 24 | Transferência | 25, 43, 44 |
| 25 | Motivo de perda | 26 |
| 26 | Origem | 27 |
| 27 | Integração com ticket | 28, 16; UI link para Central |
| 28 | Integração com orçamento | 17–19, 29–30, 49, 54 |
| 29 | Integração com agenda | 19; testes Central/Consumidor preservados |
| 30 | Notas internas não vazam | 31; UI troca de empresa |
| 31 | Busca/filtros | 24, 27, 32 |
| 32 | Idempotência | 05, 07, 33; UI confirmação perdida |
| 33 | Manipulação UUID/código | 01, 34, 51; UI URL de B |
| 34 | Acesso do consumidor | 14, 31, 35 |
| 35 | Regressão Fases 2–5 | 242 casos SQL anteriores + 41 UI anteriores + 40 ferramentas/imagens/config/HTTP anteriores |

Complementos: 36 valida 55 tabelas RLS/FORCE e escrita direta negada; 39 configuração administrativa/revisão/auditoria; 40 reagendamento/observação obrigatória; 42 desligamento sem disparo; 45 abandono legítimo; 46 serviço desativado; 50 helpers privados; 52 ordem determinística da timeline; 53 imutabilidade; 54 expiração.

## Execuções e contagem única

- `npm run test:local`: regressão passou com 53 testes comerciais e 49 UI na rodada agregada. Fundação 68; Empresa 71; Consumidor 35; Presença/preparação financeira 28; Central 40; demais ferramentas conforme resumo.
- `npm run test:commercial`: rodada final 54/54, incluindo expiração. Substitui a rodada de 53; não soma repetições.
- `npm run test:commercial-upgrade`: 1/1, aplica 014–016 sobre dados reais de fixtures na estrutura 001–013. Corrigido reconhecimento de agendamento direto; dados/eventos anteriores preservados e nenhum evento comercial histórico inventado.
- `npm run test:ui -- tests/browser/commercial.spec.ts -g 'desktop, tablet'`: reteste visual após corrigir herança da navegação vertical; repetição de um caso dos 49, não soma ao total.
- `npm run check:bundle`: typecheck/build/scan passaram; não contado como teste unitário adicional.
- `node scripts/commercial-inventory.mjs`: catálogo e hashes 001–013 conferidos; não contado como teste funcional adicional.
- `npm run test:native`: bloqueado pela impossibilidade de mapear usuário não-root neste contêiner; **nenhuma concorrência nativa executada**, não conta como aprovado.

**Total: 391 casos locais únicos aprovados; zero falhas nas rodadas finais utilizadas.** 297 casos SQL (242 anteriores + 54 comerciais + 1 upgrade), 49 UI e 45 ferramentas/imagens/configuração/HTTP local. Nenhum teste externo incluído nessa contagem.

## Inspeção visual

Desktop 1600×1000, tablet 1024×1366 e celular 390×844 em `reports/visual-phase6`. Conferidos empresa/cliente, próximo passo, prazo/responsável, filtros, estado, ação e formulário, timeline em ordem e ausência de overflow horizontal. Em telas estreitas, o detalhe aparece antes da lista para facilitar ação. Dados exclusivamente fictícios.
