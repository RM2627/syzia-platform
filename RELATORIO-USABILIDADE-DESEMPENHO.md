# SYZIA — auditoria final de usabilidade e desempenho percebido

**Base:** consolidado 044 anexado. **Data:** 01/10/2026. **Resultado local:** correções seguras concluídas; gate cumulativo vigente **PASS**. Sem deploy, publicação, nova funcionalidade, alteração de regra, nova migration ou conexão a dados reais.

O carregamento que fazia a estrutura da empresa aparecer, desaparecer e reaparecer foi reproduzido em build de produção e corrigido na fronteira responsável. A entrega conserva dois pontos que exigem decisão do proprietário: navegação empresarial/global dos tickets e ciclo de autenticação/troca de contexto. Eles estão em `UX-AGUARDANDO-APROVACAO.md`, sem implementação automática.

## 1. Causa técnica de “Minhas empresas → Abrir empresa”

O `Suspense` de `Application` envolvia todas as rotas. Quando `CompanyRoute` chegava a um módulo lazy, como `Operations`, a suspensão alcançava essa fronteira externa e substituía também o shell e os provedores já visíveis por “Carregando…”. Portanto, não era apenas um spinner repetido: a localização da fronteira de carregamento ocultava a estrutura já resolvida.

Em paralelo, `CompanyExperience` tinha dois effects que chamavam `onboarding_context` na primeira montagem: um pelo callback `reload` e outro pelo pathname/hash. Duas chamadas iguais apareceram em produção, independentemente do replay de effects do StrictMode de desenvolvimento.

A correção adiciona uma fronteira de `Suspense` dentro da área autorizada do módulo e mantém apenas um effect de leitura por navegação. O shell permanece visível; as verificações de suporte, registro de entrada, permissões e os quatro blocos independentes da Home continuam existindo. As verificações necessárias não foram ocultadas, antecipadas nem removidas.

| Evidência da entrada fria como Super Admin | Antes | Depois |
|---|---:|---:|
| Shell desaparece enquanto o módulo carrega | 1 episódio | 0 |
| `onboarding_context` na montagem | 2 | 1 |
| Requests API/mídia observadas nessa janela | 10 | 9 |
| Home carregada ao final | Sim | Sim |

Os traces de `before/root-trace.zip` e `after/root-trace.zip` e os registros `root-open-cold` preservam a sequência. Na medição anterior, o shell estava visível na verificação de permissões, oculto perto de 0,49 s e visível novamente perto de 0,80 s. Depois ele permanece visível em todas essas etapas. Esses tempos são observações locais aproximadas, não promessa de latência.

## 2. Correções automáticas

| ID | Severidade | Correção | Antes × depois / preservação |
|---|---|---|---|
| PERF-001 | UX-MÉDIO | Suspense restrito ao módulo empresarial | Evita apagar o shell ao carregar Home/áreas lazy. Autorização continua antes do conteúdo. |
| PERF-002 | UX-MÉDIO | Um effect de leitura do onboarding | 2→1 RPC na montagem de produção. Navegação, foco, comandos e mudanças de permissões continuam revalidando. |
| PERF-003 | UX-MÉDIO | Reuso de `company_context` entre seções da mesma montagem | Navegar Serviços/Manual/FAQ/Respostas/Regras deixa de limpar e refazer o contexto inteiro. Polling de 15 s, refresh após comandos e revisão server-side permanecem. |
| PERF-004 | UX-BAIXO | Feedback de abertura e bloqueio de clique duplo | “Abrindo empresa…” aparece enquanto o contexto é resolvido; lock imediato impede um segundo comando `/access/context`. Modificadores de link permanecem disponíveis. |
| PERF-005 | UX-MÉDIO | Identidade/empresa na chave de `PermissionProvider` | Trocar o escopo cria um provedor novo; nenhuma reutilização de permissões A em B foi introduzida. |
| PERF-006 | UX-BAIXO | Atualização paralela da Central após comando confirmado | `central_context` e `central_queue` continuam sendo consultadas, agora em paralelo. Mensagens, revisão, idempotência e tratamento de resultado incerto não mudam. |
| PERF-007 | UX-MÉDIO | Prévia carrega até quatro imagens autorizadas simultaneamente | Quatro imagens: 4 esperas em série→1 lote concorrente. URLs temporárias são liberadas em caso de falha. |
| PERF-008 | UX-BAIXO | Dados de presença e categorias consultados em paralelo | Consultas independentes deixam de formar uma cascata. As duas autorizações permanecem server-side. |
| PERF-009 | UX-BAIXO | Categorias reutilizam o contexto empresarial existente | O catálogo usa a mesma lista autorizada, incluindo contagem de uso; após salvar, aguarda o refresh do contexto. Sem uma RPC adicional de categorias. |
| PERF-010 | UX-BAIXO | Capacidades reutilizam a resposta do componente de assinatura | `billing_capabilities` 2→1 por entrada medida. Snapshot vinculado à empresa, limpo em erro; componentes usados fora da assinatura mantêm sua própria consulta. Nenhuma capacidade ou plano foi alterado. |
| PERF-011 | UX-BAIXO | Downloads simultâneos da mesma mídia privada são compartilhados | Na Página da empresa, 5 downloads→4 arquivos únicos. Chave inclui URL, autorização da sessão e empresa/permissões. A Promise é descartada ao concluir, inclusive em erro; não há cache persistente de mídia ou de autorização. |
| PERF-012 | UX-MÉDIO | Prévia vinculada ao código atual da imagem | Uma troca/recorte não mostra o blob anterior por um render. Cada consumidor continua dono de sua própria URL temporária e da revogação dela. |
| PERF-013 | UX-BAIXO | Erro desconhecido não afirma automaticamente falha de conexão | Falhas reconhecidas de rede continuam indicando conexão; erros não classificados recebem mensagem neutra. Causas específicas de autorização/conflito/validação existentes foram preservadas. |

Nenhum intervalo de polling de segurança foi aumentado; nenhuma disponibilidade de agenda foi cacheada; nenhum comando deixou de consultar o servidor.

## 3. Medições relevantes

Ambiente: Node 24.19.0, Chromium 153, React/Vite do lockfile, build de produção local, PGlite e servidor HTTP/Auth sintético existentes. API e mídia com **120 ms de atraso acrescentado por request**; chunks JS com **250 ms**. Fixture com empresas, clientes, agenda, tickets, mensagens, propostas, serviços e portfólio sintéticos. Foi criada apenas mais uma empresa sintética para reproduzir a entrada global sem ADM responsável.

| Trecho medido em desktop | Antes | Depois | Interpretação |
|---|---:|---:|---|
| Atualização do ticket + fila, após a resposta do comando | Aproximadamente 320 ms | Aproximadamente 200 ms | Mesmo par de leituras, agora concorrente; PGlite serializa trabalho SQL local. |
| Download das quatro imagens da prévia | Aproximadamente 510 ms | Aproximadamente 140 ms | Mesmo conteúdo, quatro requests concorrentes. |
| Página da empresa: requests API/mídia na janela | 10 | 8 | Menos um download repetido e eliminação de espera/retrabalho do carregamento. Ver requests individuais; não generalizar para todas as empresas. |
| RPC de capacidades na assinatura | 2 | 1 | A contagem total da janela pode coincidir por causa de uma chamada de atividade de sessão; comparar a RPC específica. |
| Navegação FAQ/Respostas/Regras: `company_context` por troca | 1 por seção | 0 por seção | Reuso limitado ao mesmo componente/empresa; mutações e polling continuam atualizando. |

`durationMs` nos JSONs inclui uma espera de estabilização de 650 ms, portanto não é usado como tempo puro da API. Tempos de estrutura/Home aparecem nas amostras de frame. Não foi calculado p95, SLA, benchmark de infraestrutura ou Core Web Vitals de usuários reais.

A [matriz](MATRIZ-ANTES-DEPOIS.md) reúne **71 pares de sondas/ações** e mapeia os 30 fluxos solicitados. Duas sondas de seleção do segundo ticket registram a mudança de rota/fila do UX-001; a troca efetiva após selecionar a aba novamente foi executada em `ticket-switch-*`. Esses registros não foram reclassificados retroativamente como sucesso. Há mais **13 cenários focados com asserções** sobre Home, categoria, reuso, clique duplo e layouts estreitos.

### Bundle e mídia pública

A página pública mantém o carregamento separado das áreas empresariais: os traces de entrada pública não requisitam chunks de FoundationApp, Central, Comercial, Analytics ou Billing. Foram mantidas as fronteiras de bundle já existentes; uma divisão adicional sem benefício comprovado não foi introduzida.

O total de JS de **todos os chunks** passou de 972.037 para 973.520 bytes (gzip calculado: 288.310→288.918 bytes), acréscimo aproximado de 0,15% pelo controle de escopo/feedback. Esse total não é o download inicial do consumidor. Inventários em `bundle-before.json` e `bundle-after.json`.

Na fixture pública, a maior imagem de empresa observada tem 179.644 bytes; as demais observadas têm cerca de 4,7 a 19,1 kB. Imagens de serviços/portfólio já usam carregamento tardio e áreas com proporção reservada. O enquadramento existente produz WebP limitado a 1600 px. Não foi alterado o contrato do servidor de mídia nem feita conversão destrutiva de imagens existentes. Arquivos reais enviados por clientes e comportamento do host/CDN continuam fora desta medição.

## 4. Usabilidade, mobile e estabilidade

Foram inspecionadas visualmente capturas de Home, Agenda, Central, proposta e solicitação pública, e executadas sondas desktop/mobile de navegação, formulários, dados e mídia. Nas telas medidas em 390 px não houve overflow horizontal do documento. Agenda, Clientes, Atendimento e Orçamentos também passaram pelas verificações focadas em 320 e 768 px. A navegação horizontal interna da empresa é deliberada e permanece rolável.

O gate exercitou temas público claro/escuro, identidade e proporções de imagens, FAQ/horários/ajuda mobile, rascunhos, inatividade, logout entre abas, estados vazios, autorização de colaborador, proposta, aprovação, execução e remarcação. O novo teste de falha localizada da Home confirma que a Agenda permanece visível e o retry atinge apenas o bloco que falhou.

O salto causado pelo desaparecimento do shell foi eliminado. Há alterações de altura inerentes ao conteúdo, como checklist de empresa incompleta, troca de visualização da Agenda e abertura de formulários. Não se declara CLS zero. O observador guarda amostras brutas de layout shift, mas a instrumentação não equivale a um cálculo padronizado de CLS por janela de sessão.

Não houve mudança estrutural de menus, regras de negócio, ordem da jornada, dados importantes ao consumidor, permissões ou preços. O UX-001 descreve a fricção de contexto observada na Central; o UX-002 registra as verificações repetidas na transição de sessão, que não foram eliminadas às custas da autorização.

## 5. Regressão e integridade

O comando oficial **`npm run test:current-gate` passou**, sem alterar o runner, os testes históricos ou suas asserções.

| Etapa | Resultado final | Evidência |
|---|---|---|
| Contratos do gate | 3 PASS | `gate-final/gate-gate-contracts.log` |
| Correções/requisitos SQL vigentes da 044 | 28 PASS | `gate-final/focused.json` |
| Upgrade populado | PASS; 119 tabelas e 1.170 colunas antigas verificadas | `gate-final/upgrade.json` |
| Regressões 040/041/042 e onboarding | 35 + 35 + 47 + 13 PASS | `gate-final/regression-*.json`, `onboarding.json` |
| Gateways/contratos de servidor | 62 PASS | `gate-final/gate-gateways.log` |
| Typecheck/build/inspeção de segredo server-only | PASS | `gate-final/gate-build.log`, `bundle-bundle-scan.json` |
| Navegador cumulativo | **30 PASS**, 0 falhas, 0 skips, 0 flaky | `gate-final/browser.json` |
| Isolamento dos downloads simultâneos | 3 PASS | `media-unit-tests.log` |
| Asserções sobre as comparações e guardas | 14 PASS | `comparison-checks.json` |

Todos esses caminhos são relativos a `reports/ux-performance/`. Os 13 cenários de guardas foram executados em navegador; as 14 verificações do comparativo analisam suas evidências e as medições, não são 14 novas jornadas independentes. Não se somam subcasos de navegação, inspeções e testes SQL como se fossem usuários distintos.

**Falha encontrada e resolvida:** a primeira execução terminou com 29/30 specs de navegador. O cenário de recorte identificou troca tardia do `src` da prévia após fechar o modal. A correção PERF-012 impede renderizar o blob anterior quando o código muda. O teste focado passou, e em seguida o gate completo passou. A execução inicial com falha foi preservada em `gate-initial/`; a repetição focada está em `media-focused/`. Nenhum teste foi afrouxado ou removido.

O gate final foi executado em cópia isolada das mesmas fontes para preservar os relatórios anteriores da base. Seus resultados novos estão em `gate-final/`; caminhos internos do runner referem-se à árvore dessa execução. A integridade detalhada, os arquivos alterados e os hashes estão em `ARQUIVOS-ALTERADOS.md` e `reports/ux-performance/integrity.json`. **Todas as 40 migrations, os testes históricos e os relatórios históricos da base permanecem byte a byte intactos.**

## 6. Limites e pendências externas

- PGlite e Auth/HTTP sintéticos não são Supabase real. Não houve teste de infraestrutura real, SMTP, Storage/CDN real, provider de cobrança ou PostgREST remoto.
- Não houve benchmark com alto volume, concorrência de conexões PostgreSQL nativas, dispositivos físicos, Safari/Firefox ou teclado virtual real.
- Tempos são amostras locais com atraso artificial, CPU compartilhada e espera do instrumento. O objetivo é provar duplicações, ordem de chamadas e comportamento visual, não estimar desempenho de produção.
- Parte dos fluxos foi coberta pelo gate vigente sem medição específica antes/depois de cada mutação. A matriz distingue essas situações.
- StrictMode continua habilitado no desenvolvimento. O replay de effects não foi desativado para maquiar contagens; as comparações de RPCs desta rodada usam build de produção.
- Verificações repetidas no login/troca de contexto são explicitamente o UX-002. As verificações periódicas de sessão, acesso, suporte e grants foram preservadas.
- Não houve profiling completo de renders React, amostragem estatística de todos os dispositivos ou afirmação de “performance perfeita”.

## 7. Entrega e parada

O ZIP consolidado contém fontes completos, configuração/lockfile, scripts, testes, fixtures, migrations anteriores, documentos, matriz, inventário e evidências. O [guia](GUIA-ATUALIZACAO-UX.md) explica atualização e reprodução. **Nenhuma migration é necessária nesta rodada.**

Trabalho local encerrado. Não implementar UX-001/UX-002 automaticamente, não iniciar nova fase nem fazer deploy/publicação. O próximo passo é a decisão do proprietário sobre os dois itens e o feature freeze, salvo bug sério.
