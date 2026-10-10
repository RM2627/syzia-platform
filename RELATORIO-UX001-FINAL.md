# RELATÓRIO FINAL — UX-001 e feature freeze

**SYZIA — FEATURE FREEZE FUNCIONAL PRÉ-LANÇAMENTO**

**UX-001 — CORRIGIDO.** Abertura e troca de tickets empresariais preservam o painel, a navegação e os filtros válidos da área. A Central global permanece independente. **UX-002 — ADIADO_PARA_POS_LANCAMENTO**, sem alteração.

Base exclusiva: `SYZIA-044-UX-Final-Consolidado`, resultante da auditoria anterior. Escopo aprovado integral em `docs/ux001/request.md`. Nenhum reinício do projeto, nova fase, redesign, deploy, publicação, serviço real ou dado real. Nenhuma migration nova.

## Causa e intervenção

A Central já lia `?ticket=`, mas seus cartões sempre geravam `/central/:code`. Ao sair de CompanyRoute, o componente empresarial era substituído pela Central global: desaparecia a navegação da empresa e a aba reiniciava em Minha fila. Atendimento e Pendências usavam a mesma chave React, conservando acidentalmente o filtro da área anterior.

O Comercial também levava a oportunidade empresarial para `/comercial/:code`, perdendo a origem antes mesmo de abrir o ticket. Corrigir só o link final não resolveria esse caminho.

A intervenção ficou em três arquivos de produto existentes e um pequeno helper de URLs:

- `Central.tsx`: links conforme origem, empresa fixada àquela do painel, validação do escopo da resposta e “Voltar à fila”. A seleção de ticket mantém a instância da fila. Cada detalhe continua identificado pelo ticket, agora explicitamente pela empresa também; respostas obsoletas continuam descartadas.
- `FoundationApp.tsx`: chaves por empresa e área para definir o início de Atendimento/Pendências; Comercial identificado pela empresa.
- `Commercial.tsx`: oportunidade empresarial fica em `?op=`, e seus links de atendimento/respostas rápidas levam ao painel empresarial. Contextos globais conservam suas rotas. Uma oportunidade de outra empresa não é apresentada dentro do painel atual.
- `central/navigation.ts`: gera URLs empresariais ou globais conforme a origem explícita, sem alterar autorização.

Não houve alteração nos comandos de atendimento, regras, preços, planos, papéis, atribuições, grants, RLS/FORCE RLS ou backend. Os 11 arquivos de servidor e as 40 migrations estão byte a byte iguais à base.

## Comportamento definido

| Origem/ação | Comportamento atual |
|---|---|
| Atendimento empresarial | `/painel/:empresa/atendimento?ticket=:codigo` |
| Pendências empresarial | `/painel/:empresa/pendencias?ticket=:codigo`, equivalente empresarial que preserva a área e sua fila |
| Home / Precisa da sua atenção | Mantém os links empresariais já produzidos pelo servidor: Atendimento ou Pendências conforme a tarefa |
| Notificação de decisão | Abre Pendências da empresa com o ticket; validado com decisão fictícia real na fixture SQL |
| Comercial empresarial | Oportunidade em `/painel/:empresa/comercial?op=:codigo`; ticket no Atendimento empresarial, preservando `panel=replies` quando solicitado |
| Clientes | A tela atual oferece Agendar e não possui link direto para ticket; inspecionada sem criar funcionalidade nova |
| Central e Comercial globais | Continuam `/central/:codigo` e `/comercial/:codigo`; nenhuma conversão automática para empresa |
| Abrir/trocar/voltar/avançar/limpar ticket na mesma área | Mantém aba, busca, estado, ordenação, data e paginação locais; apenas o detalhe do ticket troca |
| Entrar em Atendimento ou retornar de Pendências | Começa em Minha fila, com filtros locais iniciais |
| Entrar em Pendências ou retornar de Atendimento | Começa em Aguardando empresa, com filtros locais iniciais |
| Trocar empresa | Nova instância de área; filtros e detalhe da empresa anterior não são reutilizados |
| Recarregar/colar/copiar URL | Reabre o ticket na área indicada após validações existentes; filtros locais iniciam no padrão da área |
| Voltar à fila | Remove a seleção pelo histórico normal do navegador, conservando os filtros da montagem atual |

Os filtros não foram transformados em preferências persistentes. A URL transporta área, empresa e ticket; não transporta nem concede autorização. O servidor continua negando acesso sem grant/vínculo/atribuição. Se o mesmo usuário já é autorizado a A e B, a verificação adicional de escopo impede mostrar o ticket de B dentro do painel de A. Isso não substitui a autorização do servidor.

## Antes × depois observado

Em 1440, 390 e 320 px, partindo de Todos:

- Antes: o primeiro ticket levava à Central global e reiniciava Minha fila; era preciso clicar novamente em Todos antes de abrir o segundo ticket.
- Depois: shell empresarial e Todos permanecem; dois tickets são abertos com dois cliques, contra três no cenário anterior (excluída a seleção inicial comum do filtro).
- Abertura: uma `central_context` nos dois casos; `central_queue` adicional cai de uma para zero.
- Troca: uma `central_context`, sem nova leitura de fila provocada pela URL; nenhum loader global introduzido.
- O detalhe anterior não reaparece durante resposta atrasada do novo ticket.
- Nenhum overflow horizontal documental novo nos três tamanhos.

Há 15 pares de medições de produção (abrir/trocar/voltar/avançar/recarregar × três larguras), com capturas, requests, frames de shell e traces. [Matriz completa](MATRIZ-ANTES-DEPOIS-UX001.md). O reload empresarial conserva suas validações de permissão/onboarding; não foi comparado à Central global como se ambos tivessem o mesmo custo. Polling de sessão/fila/contexto continua vigente.

## Testes executados

| Verificação | Resultado / evidência |
|---|---|
| Navegador focado | 9 cenários PASS + 1 cenário específico de notificação PASS, sem skips/retries; `reports/ux001/browser-focused/` e `notification-focused/` |
| SQL focado de autorização | 6 cenários PASS, SQL das migrations em PGlite: ADM A/B, sem grant, grant revogado, vínculo suspenso, Equipe SYZIA atribuída/não atribuída e atribuição revogada, anônimo/consumidor; `security.json` |
| Comparação de produção | PASS nos três tamanhos; `comparison-checks.json`, `before/`, `after/` |
| Preservação de performance | PASS nas sondas selecionadas; `perf-preservation/checks.json` e `measurements.json` |
| Downloads autorizados | 3 testes PASS; `media-regression.log` |
| Gate oficial | `npm run test:current-gate`: PASS; relatório e todos os logs em `reports/ux001/gate-final/` |
| Build/typecheck/bundle | PASS, inclusive canário server-only, dentro do gate |
| Integridade | 40 migrations, 11 arquivos de servidor, 136 testes anteriores e 3.190 evidências anteriores preservados; nenhum arquivo da base ausente; `integrity.json` |

O gate foi ampliado de forma aditiva: uma etapa SQL UX-001 e uma etapa de navegador UX-001 com 10 cenários em fixture nova. Todas as etapas, asserções históricas selecionadas e testes anteriores permanecem. O gate final teve **40 cenários de navegador PASS** (30 históricos selecionados + 10 UX-001), zero falhas, zero skips e zero flaky.

Cobertura dos requisitos 1–33 do pedido:

| Requisitos | Evidência |
|---|---|
| 1–8 | Cenário empresarial em cada largura: shell, URL, troca, filtros, voltar/avançar e reload |
| 9–14 | Home, Pendências, Comercial, Clientes inspecionado e alternância determinística; notificação positiva separada |
| 15–19 | Central e Comercial globais, abertura/troca e manutenção da fila global |
| 20–25 | SQL focado + navegador: A/A, A/B, sem grant, revogação, Equipe SYZIA e usuário já autorizado em duas empresas |
| 26–29 | 1440/390/320 px, capturas e asserções de overflow |
| 30–33 | Build de produção: shell/requests; navegador com resposta atrasada: ausência de conteúdo do ticket anterior |

URL copiada em outra aba autenticada, URL sem sessão e limpeza da seleção também foram testadas. A segurança não é inferida somente da ausência de botões: os testes SQL exigem rejeição real das RPCs na fixture.

## PERF-001 a PERF-013 preservados

| Itens | Como foram confirmados |
|---|---|
| PERF-001 / 002 | Abertura fria de empresa por Super Admin: shell estável e uma RPC de onboarding |
| PERF-003 | Navegação entre Serviços, FAQ, Manual, Respostas e Regras sem nova company_context |
| PERF-004 | Clique duplo gera um comando /access/context; código de feedback/lock intacto |
| PERF-005 | PermissionProvider e sua chave por usuário/empresa intactos; navegador confirma isolamento A/B |
| PERF-006 | Após mensagem confirmada, central_context e central_queue continuam paralelas; comandos byte a byte intactos |
| PERF-007 | Quatro imagens da prévia em lote concorrente, verificado na rede |
| PERF-008 / 009 | PresenceAdmin e Categories/contexto empresarial byte a byte intactos; gate sem regressão |
| PERF-010 | Uma billing_capabilities na entrada medida; arquivos Billing/Capabilities intactos |
| PERF-011 | Downloads simultâneos únicos por URL na tela; três testes de compartilhamento/isolamento/retry aprovados |
| PERF-012 | CompanyMedia e preview intactos; cenários históricos de recorte/mídia aprovados no gate |
| PERF-013 | api.ts/mensagens de erro intactos; falhas de autorização continuam explícitas |

O código de AuthProvider, entrada, login, ContextChooser, inatividade, termos, verificação e revalidação de contexto foi preservado. A comparação confere integralmente o trecho de FoundationApp fora de CompanyRoute. UX-002 não foi iniciado e não há cache persistente de autorização.

## Ocorrências durante a validação

As primeiras execuções dos novos testes exigiram ajuste de preparação, sem mudança de regras do produto: o enum da fixture usa `suspended`; seletores de combobox foram ajustados ao nome acessível; a Home exige expandir “Ver todas” para localizar tarefas fora das oito primeiras; o funcionário multiempresa passa pelo seletor de ambiente. Execuções interrompidas/falhas de preparação estão preservadas em `browser-initial/`, `browser-preparation/` e `security-initial.json`/`security-fixture-status.json`. A primeira integração no gate teve 30 cenários históricos aprovados e cinco falhas nos testes novos: três por leitura antecipada da fila antes da resposta do filtro; duas por atribuições/planos já revogados pelos cenários históricos. A espera pela resposta do filtro foi corrigida e o gate passou a executar UX-001 em etapa com fixture própria, preservando a preparação positiva e as negações das duas suítes. Resultado anterior completo em `gate-initial/`. Asserções de autorização, isolamento e comportamento esperado não foram retiradas. Nenhum teste histórico foi editado para obter verde.

## Limites e atualização

Validação local com dados fictícios, Chromium e PGlite; não equivale a homologação em Supabase/Auth/Storage/SMTP/PostgREST reais, concorrência PostgreSQL nativa ou volume de produção. Não foram feitas integrações externas nesta intervenção. As pendências externas históricas continuam documentadas nos guias anteriores.

Não há SQL a aplicar. Usar o projeto consolidado completo, instalar com `npm ci` e executar o gate vigente conforme `docs/testing/current-regression-gate.md`. Para a build destinada ao ambiente do proprietário, fornecer suas variáveis usuais; a pasta dist da medição local não integra o pacote. O pacote contém código, lockfile, configurações, todas as migrations, testes, fixtures, documentação e evidências. [Inventário](ARQUIVOS-ALTERADOS-UX001.md).

## Encerramento

UX-001 corrigido; Central global preservada; autorização e isolamento mantidos; gate cumulativo PASS. Nenhum bug crítico/alto novo diretamente causado pela intervenção foi identificado na cobertura executada.

**SYZIA — FEATURE FREEZE FUNCIONAL PRÉ-LANÇAMENTO.**

Não adicionar funcionalidades, fazer redesign, reabrir arquitetura, alterar fluxo aprovado ou implementar UX-002 antes do lançamento. Exceções: bug sério, segurança, perda/corrupção de dados, bloqueio de lançamento ou alteração explicitamente aprovada pelo proprietário.

Sem deploy/publicação. Trabalho encerrado após esta entrega. Nenhuma atividade externa, marketing ou nova auditoria foi iniciada.
