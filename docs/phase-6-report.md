# Relatório da Fase 6 — Comercial, follow-up e recuperação

**Desenvolvimento local concluído. 391 testes locais únicos aprovados. HOMOLOGAÇÃO EXTERNA permanece PENDENTE.** Não houve Supabase real, deploy, publicação, contratação, dados/clientes reais, WhatsApp API ou conexão com banco real da MS Auto Details. Fase 7 não iniciada; aguardar aprovação expressa de Marcelo.

Escopo autorizado: `docs/scope-phase-6.md`. Entrega cumulativa completa das Fases 2–6, preservando todos os guias/ferramentas anteriores. O projeto contém código, migrations, configurações de exemplo, lockfile, scripts, testes, fixtures, documentação, relatórios, evidências e manifesto; dependências são reconstruídas com `npm ci`.

## Implementação

A oportunidade existente é a unidade comercial. Estados de interesse, solicitação, aguardando cliente, negociação, resposta, aprovado/agendamento pendente, agendado, convertido e saídas perdido/recusado/expirado/cancelado/sem resposta/inelegível refletem eventos reais. Não foi criado cliente, orçamento, agenda ou conversa paralela.

`/comercial` e `/comercial/:code` oferecem lista operacional e contexto: empresa, cliente, serviço publicado, origem, valor de proposta, último contato, próximo passo, prazo, tentativa/teto e responsável. Há busca e filtros por empresa, cliente/serviço, estado, responsável/minhas tarefas, origem, data, tipo, atraso e motivo de perda; visões Hoje, Próximos, Responderam, Abandonos elegíveis e Finalizados. Contagens são somente da página atual, sem analytics avançado da Fase 7.

`/painel/:orgId/comercial` reúne visão da empresa e configuração administrativa: habilitação, intervalos personalizados, teto, tipos elegíveis, janela, critério de conversão e motivos de perda. Regras específicas por serviço/tipo prevalecem sobre serviço, empresa e padrão. Campo vazio herda o nível seguinte; regra desativada é ignorada. Padrão 24 horas/2 tentativas, sem dois dias úteis fixos. Sugestões 2/6/24/48 horas; intervalo entre 1 e 525600 minutos, tentativas entre 1 e 10. Recuperação vem desabilitada.

Tarefas permitem assumir, iniciar, transferir, priorizar, reagendar, encerrar e registrar resultado estruturado. Tentativa é contabilizada no resultado, não no clique de assumir. Observação interna limitada a 300 caracteres; “outro” exige explicação curta. Histórico imutável, snapshot da regra e teto por ciclo; aumentar configuração não amplia silenciosamente o ciclo em andamento, reduzir pode bloquear tentativas posteriores. Motivos são explicitamente escolhidos, nunca inferidos de texto livre.

O contato exige dados persistidos, contato utilizável, empresa/serviço/cliente ativos e consentimentos operacionais vigentes. Preservado o contrato anterior de consentimento por cliente/empresa, sem autenticação por telefone e sem permissão de marketing. Rascunho recuperável exige essa base; simples visita não gera lead. Resposta real do consumidor interrompe tarefa incompatível e reaproveita o mesmo ticket. Aprovação, recusa, expiração, revogação e conversão encerram retornos incompatíveis.

Horários usam janela própria ou horário humano do manual publicado e fuso da empresa. Prazo fora da janela é conciliado para a próxima; início e resultado revalidam a janela no banco. Sem janela, não há contato autorizado. Datas digitadas indicam o horário do dispositivo; a exibição considera o fuso empresarial.

Conversão só vem de aprovação ou agendamento confirmado, conforme critério congelado no novo interesse, com referência ao evento real. Conversa não converte e conversão não é receita. Primeiro terminal confirmado é preservado em disputa; cliente que retorna cria nova oportunidade sem apagar a perdida. Uma conversão histórica não é removida por cancelamento posterior. “Serviço concluído” não é inventado: esse evento ainda não existe nos módulos aprovados.

Link direto para ticket, orçamento/agenda e painel existente de respostas rápidas autorizadas. Publicações e motores das fases anteriores preservados. Anexos continuam no gateway privado autorizado do ticket; não houve novo bucket ou exposição de arquivo.

## Segurança e banco

**Migrations 001–016 aplicadas apenas em bancos locais descartáveis. Nenhuma migration aplicada externamente.** As migrations 001–013 têm hashes preservados (`reports/phase-6-migration-integrity.json`).

| Nova migration | Conteúdo |
|---|---|
| `202609160014_commercial_schema.sql` | Seis tabelas, view interna 1:1, FKs/constraints/índices, RLS/FORCE, grants e auditoria |
| `202609160015_commercial_engine.sql` | Precedência, elegibilidade, janela, conciliação, eventos reais, interrupção e upgrade histórico |
| `202609160016_commercial_commands.sql` | Oito RPCs de configuração, leitura, tarefas, oportunidade e atualização autorizadas |

Tabelas novas: `commercial_opportunity_state`, `commercial_settings`, `commercial_rules`, `commercial_tasks`, `commercial_attempts`, `commercial_events`. Seis policies SELECT; nenhuma escrita direta concedida ao cliente. **Total: 55 tabelas públicas/55 policies de leitura com RLS/FORCE RLS.** São **8 RPCs públicas novas e 13 helpers privados**, sem EXECUTE dos helpers comerciais para clientes. Inventário completo com assinaturas, constraints, índices, triggers, páginas/componentes e scripts: `phase-6-sql-inventory.md` e `reports/phase-6-sql-catalog.json`.

Metadados internos ficam na extensão 1:1 para preservar o SELECT anterior do consumidor em `opportunities` sem vazar estado/notas administrativas. Códigos não são credenciais. FKs compostas impedem cruzar organização/cliente/solicitação/oportunidade/ticket/evento. Uma tarefa ativa por oportunidade; uma tentativa por tarefa; históricos imutáveis; sequência ordena eventos até dentro da mesma transação.

Toda operação verifica papel/vínculo/empresa/perfil/autonomia atuais e responsabilidade. Presença não concede autorização. Sessão existente não conserva papel revogado. Trava compartilhada, revisão e chave idempotente protegem contra estado obsoleto/duplicação. Frontend com confirmação perdida exige recuperar a operação com argumentos e chave originais antes de nova ação. Auditoria registra chaves/campos alterados, sem copiar corpo integral de notas.

## Testes executados e resultados

**TESTADO LOCALMENTE: 391 casos únicos aprovados, zero falhas nas rodadas finais utilizadas.** 297 SQL, 49 UI e 45 ferramentas/imagens/config/HTTP local. Não somar retestes. Consolidação em `reports/phase-6-summary.json`; matriz dos 35 requisitos em `phase-6-test-matrix.md`.

| Suíte | Aprovados | Evidência |
|---|---:|---|
| Fundação SQL | 68/68 | `security-results.json` |
| Empresa SQL | 71/71 | `company-security-results.json` |
| Consumidor SQL | 35/35 | `consumer-results.json` |
| Presença/preparação financeira SQL | 28/28 | `presence-payments-results.json` |
| Central SQL | 40/40 | `central-results.json` |
| Comercial SQL | 54/54 | `commercial-results.json` |
| Upgrade 013→016 com dados anteriores | 1/1 | `commercial-upgrade-results.json` |
| Ferramentas Fundação/Empresa/Central/Comercial/Consumidor | 32/32 | `phase-6-local-final.txt` |
| Imagens | 9/9 | `phase-6-local-final.txt` |
| Configuração segura | 3/3 | `config-security-results.json` |
| HTTP loopback da demo | 1/1 | `demo-http-results.json` |
| Chromium (41 anteriores + 8 comerciais) | 49/49 | `phase-6-browser-regression.json` |

Evidências acima ficam em `reports/`. Rodada agregada `npm run test:local` passou; depois a rodada comercial final incluiu o caso de expiração (54, substituindo 53) e o upgrade final validou a correção de conciliação histórica. O reteste visual repete um caso existente e não aumenta o total. O comando `test:local` entregue já inclui também o upgrade.

Typecheck/build/scan do bundle: **PASS**, `phase-6-bundle-scan.json` e `phase-6-build.txt`. Marcador fictício de segredo server-only e variável privilegiada não aparecem no frontend. Aviso informativo do chunk inicial: aproximadamente 503 kB / 144 kB gzip; não é falha nem deploy.

Inspeção visual feita em desktop 1600×1000, tablet 1024×1366 e celular 390×844, com screenshots em `reports/visual-phase6`. Sem overflow horizontal; detalhe aparece antes da lista em telas estreitas. Conferidos próximos passos, estados, contexto e separação da observação interna. Não houve publicação da interface.

Ambiente: Node 24, PostgreSQL 18.3 via PGlite 0.5.8, Auth/claims/Storage simulados e Playwright/Chromium local. O teste HTTP loopback é demonstração local. A validação de revisão em série **não é concorrência com conexões independentes**.

## Falhas encontradas e correções

- A retomada encontrou o ambiente local restaurado à Fase 5. As alterações registradas foram reconstruídas, uma cópia recuperável foi salva e todos os resultados finais vieram de novas execuções sobre os arquivos entregues; resultados ausentes não foram usados como prova.
- A revisão impediu tomar tarefa atribuída a administrador e encerrar/reprogramar oportunidade pertencente a outro responsável ativo. Casos 43/44 verificam a proteção.
- Metadados comerciais foram mantidos fora da tabela de oportunidade exposta ao próprio consumidor. Teste 31 confirma ausência de vazamento.
- Ordem de eventos com timestamp igual foi estabilizada por sequência; caso 52 verifica interesse antes de solicitação/proposta.
- O teste de upgrade revelou que agendamento direto anterior podia ter solicitação ainda não marcada como aprovada. Conciliação foi corrigida para usar agendamento confirmado e evento real, sem exigir uma etapa intermediária que o fluxo não tinha. Reteste passou, preservando dados/eventos anteriores e sem fabricar timeline.
- Erros de montagem de rotas/fixtures foram corrigidos: JSX, valor válido de presença, coluna de auditoria e formato dos horários retornados pelo motor. A segurança do banco não foi reduzida para acomodar testes.
- Inspeção visual detectou herança de navegação vertical no desktop; CSS comercial foi isolado e as três resoluções reinspecionadas.

## Limitações e pendências

- **PENDENTE DE HOMOLOGAÇÃO EXTERNA:** Supabase/Auth/SMTP/PostgREST/RLS com tokens reais, Storage/gateway real, abuso no provedor, expiração/revogação reais, concorrência independente, backup e restauração.
- `npm run test:native` não iniciou PostgreSQL nativo: contêiner sem mapeamento de usuário não-root. Nenhum teste de concorrência nativa foi executado ou contabilizado como aprovado. Scripts HTTP e SQL independentes preparados para execução futura por Marcelo.
- Trava global compartilhada prioriza consistência do MVP e reduz paralelismo. Alterá-la exige revisão e testes próprios; não foi relaxada.
- Conciliação é por eventos e pela tela/atualização, em lotes de 200 com cursor. Prazos persistidos não dependem do browser para existir; não há cron/worker externo instalado, disparo automático ou promessas de notificação em background.
- Sem confirmação de realização de serviço, não existe conversão por conclusão; critérios atuais são aprovação/agendamento. Sem receita, gateway real, métricas avançadas ou billing.
- Consentimento operacional segue o modelo existente por cliente e empresa. Eventual granularidade adicional por pedido exige evolução explícita do contrato, sem tratar telefone como identidade.
- Supabase real continua pendente por decisão do usuário; não bloqueia desenvolvimento futuro **expressamente autorizado**, mas não permite declarar homologação.

Guia e runners em `phase-6-homologation.md`, modelo de relatório externo em `phase-6-external-report-template.md`; guias anteriores preservados. Instruções de instalação/build/configuração/publicação futura no README e `future-launch.md` não autorizam executar lançamento.

**Conclusão:** Fase 6 entregue para revisão do DESENVOLVIMENTO LOCAL. Não homologada externamente e não publicada. Parar e aguardar aprovação de Marcelo antes da Fase 7.
