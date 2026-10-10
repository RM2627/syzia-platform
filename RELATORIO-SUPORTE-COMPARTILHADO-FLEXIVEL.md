# SYZIA — suporte compartilhado flexível (046)

Base exclusiva: **SYZIA-045-Disponibilidade-Equipe-Assistido-Consolidado**. Pedido integral: `docs/flexible-support/request.txt`. Validação local concluída em 04/10/2026 UTC, com dados fictícios.

**SYZIA — FEATURE FREEZE RESTABELECIDO**

O refinamento autorizado foi implementado sobre a 045, sem reconstrução. O gate cumulativo passou nas **15 etapas**, sem etapas omitidas. Os testes focados passaram em **20/20 casos SQL** e **9/9 cenários de navegador**. A implementação anterior, limites/ciclos e histórico foram preservados. Não houve deploy, publicação, integração de pagamento ou início da próxima etapa.

## Comportamento entregue

O Super Admin escolhe o **Modelo de disponibilidade** na política global já existente:

- **Conforme disponibilidade da equipe:** não exige grade semanal. Tickets e mensagens continuam registrados quando não há integrantes disponíveis. A fila permanece sem atribuição fictícia e sem consumo por espera.
- **Horário programado:** mantém dias, múltiplos intervalos, timezone e mensagem fora do horário da 045. A política ativa e a janela continuam limitando a atuação compartilhada. A grade é conservada ao trocar de modo.

A presença operacional já existente na Central foi reutilizada. Para assumir ou receber um novo ticket compartilhado, o integrante precisa estar **Disponível**, autorizado, atribuído à empresa, com os grants necessários e com a empresa elegível. **Ocupado**, **Em pausa** e **Offline** impedem novas assunções/transferências compartilhadas no servidor. A mudança de presença não encerra nem devolve automaticamente um ticket existente. Ele pode continuar sendo atendido quando política e autorizações permitirem.

**Uma unidade permanece sendo um ticket distinto efetivamente assumido ou recebido por transferência pela Equipe SYZIA dentro do ciclo.** Cinco mensagens, reassumir ou transferir entre integrantes no mesmo ciclo não multiplicam consumo. Fila e mensagem do consumidor consomem zero. Ao atingir o limite, um ticket ainda não contabilizado não recebe nova atuação compartilhada; os já contabilizados podem continuar. Equipe própria, consumidor e autoatendimento permanecem operantes.

O ADM empresarial consulta consumo e regras e vê o estado **Aguardando apoio** na ficha da Central, sem editar política global ou limite. Presença não substitui plano, atribuição, grants, manual publicado ou autonomia; todas as proteções existentes continuam exigidas.

Sem humano disponível, o consumidor recebe: **“Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível.”** Não há prazo ou detalhe interno da equipe. Fora da janela programada, a mensagem personalizada da 045 é mantida.

Planos, capabilities, onboarding e pessoas usam a terminologia **Suporte compartilhado no atendimento**, **Apoio da Equipe SYZIA** e **Conforme disponibilidade da equipe**. As descrições personalizadas dos planos foram preservadas; acrescentou-se a explicação do benefício onde a capability de apoio existe. O editor de planos teve uma explicação antiga de consumo alinhada à regra efetiva da 045. Textos completos: `docs/flexible-support/ui-copy.md`.

## Antes × depois

| Aspecto | Base 045 | Entrega 046 |
|---|---|---|
| Política global ativa | Exigia uma grade semanal | Flexível sem grade ou programada com a grade existente |
| Presença para nova assunção | Central permitia Disponível/Ocupado segundo suas regras anteriores | Novo atendimento compartilhado exige Disponível; equipe própria preservada |
| Transferência compartilhada | Elegibilidade e consumo da 045 | Mesmas proteções, acrescidas de presença Disponível no destinatário |
| Sem integrante disponível | Fila/mensagens existentes, com informação baseada na janela | Fila preservada; informação baseada na disponibilidade operacional, sem promessa de prazo |
| Consumo e limite | Um ticket/ciclo, quota e histórico | Mesma chave, funções críticas, ledger e ciclos |
| Disponibilidade individual e Agenda | Implementadas na 045 | Preservadas, inclusive responsáveis, bloqueios, buffer e múltiplos períodos |
| Consultas da ficha da Central | `central_context` existente | Mesma chamada HTTP com campos agregados; presença vem da fila já carregada |
| Terminologia comercial | Apoio humano e explicações anteriores | Suporte compartilhado conforme disponibilidade |

O “antes” funcional foi inspecionado na base consolidada, sem reconstruir o histórico ou repetir sua auditoria integral. A comparação de desempenho usa medições históricas preservadas da 045 e um novo ensaio na 046; seus limites estão em `docs/flexible-support/performance-comparison.md`.

## Banco e preservação

A política 045 não possuía um campo que distinguisse os dois modelos. Foi necessária somente a migration incremental **202610030046_flexible_shared_support.sql**, transacional e sem reset. Ela acrescenta `private.assisted_policy.availability_mode` e adapta funções sobre as estruturas existentes. Não cria sistema paralelo de escala, presença, consumo ou distribuição.

Default seguro: uma política inativa e vazia começa flexível, ainda inativa. Uma política 045 já ativa ou com grade continua **programada**, conservando horário, fuso, mensagem e revisão. O Super Admin muda explicitamente para flexível quando adotar o modelo de lançamento. Nenhum horário ou limite comercial é escolhido pela migration.

A RPC nova salva modo e configuração com controle de revisão e auditoria existentes. A RPC antiga de cinco argumentos continua com semântica programada para compatibilidade. As funções privadas novas não são expostas a usuários anônimos ou autenticados; a gravação global exige Super Admin. A informação na Central é agregada após a autorização existente. As assunções/transferências usam o mesmo bloqueio transacional da Central e o consumo idempotente da 045.

O upgrade populado comparou **125 tabelas** preservando todas as linhas e colunas anteriores, com novos registros apenas nas auditorias esperadas. Foram comparadas **dez definições críticas** de disponibilidade/Agenda/quota/ciclo, sem alteração. As **41 migrations históricas**, inclusive a 045, permanecem byte a byte. O pacote conserva todos os **6.533 arquivos originais**, com as alterações enumeradas no inventário e sem exclusões. Assertions históricas, lockfile, AuthProvider, UX-001 e assets foram preservados.

O runner escreve em caminhos históricos. Por isso, as saídas desta rodada foram copiadas para `reports/flexible-support/current-gate/` e os bytes dos relatórios da 045 foram restaurados. A referência vigente é `reports/flexible-support/current-gate.json`, mesmo que o identificador do runner dentro dele permaneça `044`. O manifest novo é o inventário de integridade atual; manifests anteriores permanecem históricos.

## Validação executada

| Validação | Resultado | Evidência da 046 |
|---|---|---|
| SQL focado 046 | **20/20 PASS** | `focused.json` |
| Upgrade populado 045 → 046 | **PASS; 125 tabelas e dez funções** | `upgrade.json` |
| Regressão SQL 045 | **29/29 PASS** | `current-gate/reports/team-availability/focused.json` |
| Navegador 045 | **8/8 PASS** | `current-gate/reports/team-availability/browser.json` |
| SQL 040 / 041 / 042 | **35/35 + 35/35 + 47/47 PASS** | `current-gate/reports/syzia-044/regression-*.json` |
| SQL focado 044 / onboarding / segurança UX-001 | **28/28 + 13/13 + 6/6 PASS** | `current-gate/reports/syzia-044/{focused,onboarding}.json; current-gate/reports/ux001/security.json` |
| Gateways | **62/62 PASS** | `current-gate/reports/syzia-044/gate-gateways.log` |
| Navegador cumulativo | **30/30 PASS; inclui 82/82 subcasos de navegação** | `current-gate/reports/syzia-044/browser.json` |
| Navegador UX-001 | **10/10 PASS** | `current-gate/reports/ux001/browser.json` |
| Navegador 046 | **9/9 PASS; sem skipped/flaky** | `browser.json` |
| Build / typecheck / inspeção de bundle | **PASS** | `current-gate/reports/syzia-044/gate-build.log` |
| Gate oficial completo | **15/15 etapas PASS** | `current-gate.json` |
| Preservação de desempenho | **PASS; 11 cenários instrumentados** | `performance/checks.json e measurements.json` |

Caminhos relativos a `reports/flexible-support/`. A inspeção de bundle também confirmou ausência do marcador fictício reservado ao servidor.

Gate executado entre **2026-10-04T00:12:05.290Z** e **2026-10-04T00:20:40.756Z**. O gate inclui as suítes listadas acima; as contagens se sobrepõem e não devem ser somadas como casos únicos do produto. Os 82 subcasos fazem parte do cenário de inspeção de navegação. A matriz dos 25 requisitos fica em `docs/flexible-support/test-matrix.md`.

Foram exercitados: fila sem humanos/sem quota, persistência de mensagens, autoatendimento, equipe própria, presença indisponível, assunção disponível, cinco mensagens, transferência/reassunção, limite atingido, continuidade de ticket contado, ambos os modos, Super Admin versus ADM, plano sem Assistido, suspensão, isolamento A/B, revogação de grants/vínculo e preservação de preços/trial/faturas.

As capturas da 046 foram inspecionadas em desktop e mobile, com configuração e planos também em 320 px. Não houve overflow horizontal nos nove cenários. Horários, quantidades e preços nas imagens são dados fictícios de teste, não definições comerciais. Traces e screenshots acompanham o índice em `docs/flexible-support/evidence.md`.

### Problemas encontrados durante a preparação

- Os primeiros cenários novos ajustaram seus parâmetros aos contratos reais já existentes: chave `faqs`, `consumer_start_help.p_stage` e propriedades permitidas dos itens. O seed de upgrade foi colocado em transação para usar corretamente as identidades locais.
- O cenário positivo de Central criava um serviço, tornando o manual publicado obsoleto. Ele passou a publicar um manual atualizado pelos comandos autorizados, preservando a exigência de prontidão. Nenhuma elegibilidade foi relaxada.
- O navegador cumulativo detectou uma troca desnecessária do rótulo “Equipe SYZIA · Atendimento compartilhado”. O arquivo de Pessoas e acessos foi restaurado integralmente à 045: esse texto já era adequado. O teste histórico permaneceu intacto, e o gate foi repetido por inteiro.
- O primeiro gate após meia-noite UTC falhou no caso histórico 042-46 de métricas: o teste selecionava a data UTC enquanto a API usa o fuso da empresa. O adaptador atual passou a selecionar a data local de `now()` no timezone empresarial. Todas as assertions de contagem, valor realizado e valor recebido foram preservadas; o teste histórico e o código de métricas não foram alterados. A falha inicial está arquivada separadamente.

O resultado final completo substitui os ensaios exploratórios. A falha controlada intencional do runner continua comprovando retorno não-zero; não é falha funcional pendente.

## Desempenho e limites

O ensaio existente de preservação de desempenho foi executado no build de produção local configurado para a demo, com latência sintética de 120 ms por API e 250 ms por chunk. Ele verifica shell/onboarding, clique duplo, reuso de contexto, atualização paralela da Central, prévia concorrente, capabilities e downloads compartilhados. A comparação de números e traces está no documento específico.

Não foi criado polling, remontagem adicional ou uma RPC por integrante/ticket para disponibilidade: os campos estão nos payloads existentes. As alterações no backend acrescentam verificação de presença/autorização, sem reconstruir os motores anteriores. **UX-002 permanece adiado**; a revalidação de sessão e assinaturas repetidas já documentadas na base não são apresentadas como eliminadas.

O ambiente validado foi **PGlite local + Auth/HTTP fictícios + Chromium 153**, Node 24.19.0. Isso não equivale a Supabase/Auth/SMTP/Storage/PostgREST reais. Concorrência entre conexões PostgreSQL independentes, escala de produção, credenciais reais e restauração continuam **PENDENTES DE HOMOLOGAÇÃO EXTERNA**. Não foram conectados serviços externos ou dados reais.

## Confirmações e encerramento

- **Implementação 045 preservada**, inclusive disponibilidade individual e Agenda.
- **Limite, threshold, consumo, ciclo e histórico preservados**; nenhum X definitivo ou cobrança excedente foi criado.
- **Sem horário comercial hardcodado.** A grade é opcional no flexível e configurável no programado.
- **Sem promessa de funcionário dedicado**, atendente exclusivo ou cobertura humana contínua.
- **Sem SLA ou promessa de resposta imediata.**
- **Sem deploy ou publicação.**
- **Sem integração de pagamento**, checkout/provider, mudança de preço ou trial.

Entrega: projeto completo consolidado, migration individual, guia de upgrade, configuração dos dois modos, textos finais, matriz, inventário, resultado do gate e evidências. Arquivos e hashes constam no manifest e em `SHA256SUMS-046.txt`.

Fechamento comercial dos planos → checkout/provider → homologação externa → lançamento continuam como próximas etapas do proprietário, não iniciadas automaticamente. Trabalho encerrado nesta entrega.
