# Matriz de testes — Fase 5

**Escopo local:** PostgreSQL WASM/PGlite com RLS real do motor e claims/Auth simulados; browser local com transporte interceptado e fixtures; gateway HTTP de demonstração em loopback. Não equivale a Auth, PostgREST ou Storage reais. Testes sequenciais com mesma revisão não demonstram concorrência entre conexões independentes.

## Requisitos obrigatórios do escopo aprovado

| Nº | Requisito | Evidência executável | Resultado/limite |
|---|---|---|---|
| 1 | Atendente autorizado | Contexto da empresa correta; manual snapshot publicado | PASS local |
| 2 | Sem vínculo | Negação de contexto, UUID/código e SELECT direto | PASS local |
| 3 | Revogação durante sessão | Perfil/papel/vínculo/membro alterados sem renovar claims; UI aberta bloqueada | PASS local; JWT real pendente |
| 4 | Empresa A/B | Consulta, decisão, busca e FK composta cruzadas recusadas | PASS local |
| 5 | Nota interna e consumidor | RPC de thread e RLS excluem notas/escalonamentos | PASS local |
| 6 | Resposta rápida A/B | Contexto multiempresa e manual_id da mensagem verificados | PASS local |
| 7 | Manual privado/rascunho | Rascunho não entra no contexto; manual publicado autorizado | PASS local |
| 8 | Limite de desconto | Desconto acima da autonomia recusado no banco | PASS local |
| 9 | Preço arbitrário | Valor esperado adulterado e RPC antiga/motor privado negados | PASS local |
| 10 | Dupla atribuição | Duas tentativas com mesma revisão têm um vencedor | PASS serial local; conexões independentes PENDENTES |
| 11 | Transferência simultânea | Revisão obsoleta/destinatário inválido/antigo responsável recusados | PASS serial local; interleaving real PENDENTE |
| 12 | Mensagem obsoleta | 40001, sem gravação; UI conserva texto e exige revisão explícita | PASS local |
| 13 | Encaminhamento | Motivo, resumo, pergunta e estado aguardando empresa | PASS local |
| 14 | Decisão da empresa | Somente administrador de A responde; retorno ao fluxo | PASS local |
| 15 | Orçamento integrado | Imutabilidade, cálculo, desconto auditado, idempotência e regressão consumidor | PASS local |
| 16 | Agenda integrada | Exclusão, cancelamento, aprovação exigida, rollback e UI de contratação | PASS serial local; concorrência real PENDENTE |
| 17 | Empresa suspensa | Atendente e consumidor impedidos na operação seguinte | PASS local |
| 18 | Atendente suspenso | Perfil/role/vínculo reavaliados no banco | PASS local |
| 19 | Busca autorizada | Org/texto/estado/data/visão filtrados dentro da autorização | PASS local |
| 20 | Projeção pública | Nota interna não aparece no thread/empresa B | PASS local |
| 21 | Autoria/histórico | Mensagens/eventos/transferências preservam autores e datas | PASS local |
| 22 | Resolução/reabertura | Reabre sem duplicar; encerrado gera novo relacionado | PASS local |
| 23 | Presença | Disponibilidade não concede acesso; pausa impede assumir; sessão única | PASS local |
| 24 | Autonomia alterada | Nova operação bloqueada até publicação/revisão; nenhum privilégio por frontend | PASS local |
| 25 | Financeiro preparado | Escrita em pagamento/permissão negada; sem confirmação operacional | PASS local |
| 26 | Segredos/log/auditoria | Marcador server-only, configuração VITE, auditoria sem corpos sensíveis | PASS local; bundle scan aprovado |
| 27 | Regressão F2/F3/F4 | Suítes SQL, imagens, tooling, demo HTTP, config e navegador preservadas | PASS local; 323 casos únicos no conjunto |

Casos SQL: `tests/central.test.mjs`; UI: `tests/browser/central.spec.ts`; configuração/runners: `tests/central-tools.test.mjs`. Resultados individuais em `reports/central-results.json`, `reports/browser-results.json` e logs da validação final. Os testes dos itens 10/11/16 continuam **PENDENTES DE HOMOLOGAÇÃO EXTERNA** quanto a transações independentes. Nenhum PASS local substitui essa validação.

## Casos adicionais e regressão

- Consumidor de mesmo telefone não obtém identidade nem acesso a thread alheio; link somente consulta não envia mensagem, revogação retira acesso.
- Anexo do pedido A só emite ticket de leitura para atendente autorizado de A; B é recusada mesmo conhecendo os códigos. Gateway/Storage reais pendentes.
- Preço “a partir de” não vira preço final pela Central; encaminhar empresa. Proposta não aprovada não autoriza reserva.
- Aprovação pelo consumidor desperta o ticket e define próxima ação de agenda.
- Configuração operacional protegida por administrador/revisão; notas administrativas dependem de compartilhamento explícito.
- Oito tabelas novas participam da verificação de 49 tabelas com RLS/FORCE RLS, SELECT somente e motores privados inacessíveis.
- UI: fila/claim/mensagem/nota, três resoluções, troca A→B, revisão antiga, encaminhamento/resposta, revogação jornada proposta→aprovação→agenda e perda da resposta após commit sem duplicação.
- Regressão: Fundação (68), Empresa (71), consumidor (35), presença/preparação financeira (28), ferramentas (10+5+7), imagens (9), HTTP demo (1), configuração (3) e UI anterior (33).

## Consolidação

323 casos locais únicos aprovados, zero falhas finais. UI = 33 casos das fases anteriores + 8 Central; os sete casos repetidos entre rodadas não são contados duas vezes. Ver `reports/phase-5-summary.json`. Concorrência independente, Auth e Storage reais não integram esse total.

## Como repetir

```sh
npm ci
npx playwright install chromium
npm run test:local
npm run check:bundle
```

Fallback opcional Linux: `node scripts/prepare-browser.mjs`; definir `FOUNDATION_CHROMIUM_PATH` com caminho absoluto do binário informado. Esse preparo não modifica segurança da aplicação.

Para testes externos, seguir `phase-5-homologation.md`; registrar resultados no template próprio, sem editar resultados locais para fazê-los parecer externos.
