# SYZIA — disponibilidade da equipe e limites do Assistido

Data da validação: 03/10/2026. Base exclusiva: **SYZIA-044-UX001-Feature-Freeze-Consolidado**. Escopo autorizado integral em `docs/team-availability/request.txt`.

**SYZIA — FEATURE FREEZE RESTABELECIDO**

As duas lacunas autorizadas foram implementadas e validadas localmente. O gate cumulativo terminou com PASS nas 12 etapas, sem etapas omitidas. Não foi identificado crítico/alto novo no escopo exercitado. Não houve deploy, publicação, integração de pagamento ou início da próxima etapa.

## Resultado entregue

### Disponibilidade para atendimentos

- Funcionários próprios começam herdando o horário da empresa. Horário personalizado aceita vários intervalos por dia e dias sem atendimento.
- A área existente de Pessoas e acessos recebe a configuração agregada na RPC `permissions_team`. Não existe uma consulta HTTP sequencial por funcionário.
- A Agenda mantém o responsável opcional. A ficha permite atribuir, trocar e remover responsável usando o grant vigente `agenda.manage`.
- O servidor valida o período reservado inteiro, inclusive buffer, contra o horário da empresa, a disponibilidade individual, os bloqueios e conflitos. As restrições de recursos e o motor de execução existentes continuam ativos.
- O mesmo funcionário não pode ocupar dois atendimentos simultâneos incompatíveis, inclusive em recursos diferentes. A restrição adicional não aumenta a capacidade da empresa.
- Alterar o horário não move, cancela, apaga ou modifica reservas existentes. A resposta informa quantos compromissos futuros ficaram fora da disponibilidade.
- Bloqueios da base eram vinculados ao recurso empresarial, sem funcionário específico. Foram preservados; acrescentou-se somente uma lista individual de indisponibilidades por data inteira ou intervalo, convertida no servidor pelo fuso da empresa.
- Mensagens empresariais diferenciam profissional indisponível, empresa fechada e conflito quando a causa está disponível. A mensagem pública mantém linguagem simples.

A base não possuía campo de responsável individual em `appointments`. A extensão mínima é uma referência opcional por período já existente. No replanejamento, a atribuição acompanha o número da parte; partes novas permanecem sem responsável. Remover uma parte atribuída exige revisão explícita da atribuição, em vez de perdê-la silenciosamente. Não há distribuição automática ou motor de disponibilidade paralelo. Duração, buffer, ordem, atomicidade, AUD-002 e AUD-003 continuam cobertos pelas regressões.

### Assistido SYZIA

O Super Admin configura ativo/inativo, timezone, intervalos semanais, mensagem fora do horário, quantidade incluída e aviso por versão de plano. O administrador empresarial consulta seu consumo, sem editar a política global.

A migration começa com atendimento compartilhado **inativo**, horários vazios e limites não configurados. UTC é somente o valor técnico inicial do campo de fuso. Nenhum horário comercial ou número de atendimentos foi escolhido pelo projeto.

**Uma unidade corresponde a um ticket distinto assumido ou recebido por transferência pela Equipe SYZIA dentro de um ciclo da empresa.** A chave única é `(ciclo, ticket)`. Cinco mensagens, reassunção ou troca entre atendentes compartilhados no mesmo ciclo não multiplicam consumo. No ciclo seguinte, a primeira retomada compartilhada pode consumir uma unidade no novo ciclo. Tickets legados não recebem cobrança/consumo retroativo: a primeira ação humana compartilhada após a atualização registra a unidade vigente. Mensagens do consumidor nunca consomem uma unidade.

Ao atingir o limite, apenas um ticket ainda não contabilizado fica impedido de receber nova atuação compartilhada. Tickets já contabilizados continuam dentro do horário; a própria empresa continua atendendo. Página pública, FAQ, autoatendimento, solicitações e mensagens do consumidor permanecem disponíveis. Fora do horário, a informação pública não promete presença humana imediata e os comandos compartilhados são negados; a fila fica registrada para retomada explícita.

O ciclo pode aproveitar `period_start`/`period_end` da assinatura vigente na primeira utilização ou ser registrado explicitamente por Super Admin. O contrato `assisted_cycle_start` usa empresa, versão, início, fim e referência idempotente, sem provedor específico. Ciclos não se sobrepõem, e reenviar a referência não zera consumo. Ciclos e registros de consumo são imutáveis; mudanças de configuração guardam autor, data e valores anteriores/novos. Downgrade preserva histórico e retira a elegibilidade conforme as capabilities existentes.

O contador mensal antigo deixou de ser apresentado/editado como limite atual do atendimento humano; seus dados históricos foram mantidos. Planos, preços e trial não foram modificados. Não há cobrança automática por excedente, checkout ou webhook novo.

## Antes × depois

| Aspecto | Base consolidada 044/UX001 | Entrega 045 |
|---|---|---|
| Disponibilidade individual | Sem configuração própria por funcionário | Herança padrão, intervalos semanais e bloqueios pontuais |
| Responsável na reserva | Sem campo individual em `appointments` | Opcional por período; interseção e conflitos revalidados no servidor |
| Mudança de disponibilidade | Sem configuração individual | Reservas intactas e aviso de compromissos fora do horário |
| Horário da equipe global | Sem política global de disponibilidade compartilhada | Configuração exclusiva do Super Admin, inativa até configuração |
| Consumo humano | Contagem mensal anterior, sem o novo ciclo/ticket compartilhado | Um ticket por ciclo; consumo e configuração auditáveis |
| Limite definitivo | Ainda não decidido pelo proprietário | Continua pendente, configurável sem alteração de código |
| Leitura de funcionários | `permissions_team` existente | Mesma RPC agregada; zero chamadas adicionais por pessoa |
| Regressão oficial | Gate 044 com UX001 | Mesmo comando, acrescido de upgrade, SQL e navegador desta rodada |

O “antes” de comportamento foi identificado na base fornecida; não é uma reconstrução do histórico nem uma nova execução funcional integral da base antiga. A comparação medida de desempenho está em `docs/team-availability/performance-comparison.md`, com dados brutos e traces.

## Validação executada

| Validação | Resultado | Evidência atual |
|---|---|---|
| Casos focados de funcionário e Assistido | **29/29 PASS** | `reports/team-availability/focused.json` |
| Upgrade populado 044 → 045 | **PASS; 119 tabelas com linhas/colunas anteriores preservadas** | `reports/team-availability/upgrade.json` |
| Novo navegador: equipe, política, consumo e Agenda | **8/8 PASS; zero skipped/flaky** | `reports/team-availability/browser.json` |
| Navegador cumulativo anterior | **30/30 PASS** | `reports/team-availability/current-gate/reports/syzia-044/browser.json` |
| UX-001 | **10/10 PASS** | `reports/team-availability/current-gate/reports/ux001/browser.json` |
| Inspeção de navegação incluída no navegador cumulativo | **82/82 subcasos PASS** | `reports/team-availability/current-gate/reports/syzia-044/ui/resultados.json` |
| Gate oficial `npm run test:current-gate` | **12/12 etapas PASS** | `reports/team-availability/current-gate.json` |
| Typecheck, build e inspeção do bundle | **PASS**, incluídos no gate | `reports/team-availability/current-gate/reports/syzia-044/gate-build.log` |
| Preservação de desempenho em build de produção local | **PASS** | `reports/team-availability/performance/checks.json` |

Os 82 subcasos fazem parte da inspeção de navegação, e as suítes focadas/de navegador integram o gate. Esses números não devem ser somados como uma única contagem de testes independentes. A matriz liga cada requisito obrigatório à evidência em `docs/team-availability/test-matrix.md`.

O gate foi executado entre **16:50:13 e 16:57:40 UTC** em 03/10/2026. As etapas incluem contratos do gate, upgrade 045, disponibilidade/Assistido, segurança UX001, AUD-001–003, upgrade histórico, regressão 040/041/042, gateways, build, navegador cumulativo, novo navegador e UX001. A falha controlada intencional do runner continua retornando não-zero; esse artefato FAIL é evidência de que o gate detecta falhas, não um teste funcional pendente.

Foram exercitados isolamento A/B, grants, vínculo revogado, identidade global indevida como funcionário, acesso direto por RPC/URL, tentativas de editar política global como ADM empresarial, transferências acima da quota e identidade global com vínculo empresarial legado. As negações relevantes verificam também a causa e preservação do estado anterior. A contagem de faturas permanece inalterada.

### Correções encontradas durante a validação

- O editor individual perdia a pessoa selecionada quando o contexto era atualizado. A seleção agora só é limpa quando muda a empresa; o teste salva, recarrega e verifica os dois intervalos persistidos.
- Reabrir um ticket pelo consumidor fora do horário não deve consumir quota nem bloquear a mensagem. A guarda passou a agir na atribuição compartilhada; a retomada humana usa o registro idempotente. S09 cobre a reabertura de ticket resolvido fora do horário e no limite.
- Uma identidade global com vínculo local legado não pode se passar por equipe própria para evitar quota. A identificação considera o papel global e a atribuição ativa; S12 cobre a negação.
- A configuração fictícia da regressão foi movida para depois da comparação imutável de upgrade. Nenhuma asserção histórica foi relaxada.
- O primeiro ensaio de desempenho usou o build genérico sem os endpoints de demo e parou antes do login. Foi repetido com um build separado configurado para localhost; o ensaio completo passou. Logs de diagnóstico anteriores não substituem o resultado final.

### Desempenho e preservação

O ensaio existente verifica diretamente PERF-001/002/003/004/006/007/010/011. PERF-005/008/009/012 continuam nos mesmos arquivos byte a byte, com cobertura do gate; a tradução neutra PERF-013 foi preservada ao acrescentar erros específicos. UX-001, AuthProvider, navegação estrutural e assets não foram alterados.

A tela de assinatura acrescenta uma RPC para o novo consumo. `billing_capabilities` continua sendo chamada uma vez. A abertura com clique duplo mantém uma única chamada `/access/context`. A montagem fria do Super Admin mantém o shell; o ensaio de entrada empresarial ainda registra a revalidação de sessão e duas assinaturas de requests repetidas que já constam no artefato da base. Isso pertence à pendência UX-002, explicitamente adiada: não é apresentado como eliminado nesta rodada.

Capturas novas foram conferidas visualmente em desktop e mobile, com editor individual a 1440/390/320 px, política global a 1440/390 px e ficha da Agenda a 1440/390 px. Os oito cenários verificam ausência de overflow horizontal. Os números e horários presentes nas capturas são fixtures de teste, **não decisões comerciais**.

## Banco e integridade

A migration incremental necessária é `supabase/migrations/202610030045_team_availability_assisted.sql`, transacional e sem reset. As 40 migrations históricas existentes permanecem byte a byte, sem renumeração ou criação de uma 043. A nova estrutura exige persistência de disponibilidade, responsável, política, ciclos e consumo; não é uma migration apenas de numeração.

As tabelas novas têm RLS/FORCE RLS e acesso por comandos autorizados, sem grants diretos ao cliente. A política começa segura e sem valores comerciais. Todas as reservas existentes mantêm o responsável vazio; nenhuma linha antiga é reatribuída pela atualização. A verificação de upgrade compara linhas e colunas anteriores das 119 tabelas populadas e os privilégios anônimos das novas RPCs.

Os testes e relatórios históricos, o lockfile e as migrations anteriores foram preservados. Como o runner vigente escreve em caminhos históricos, a evidência desta execução foi copiada para `reports/team-availability/current-gate/` e os relatórios anteriores foram restaurados a partir da base. Os caminhos internos dos logs do runner são relativos ao projeto original; acrescente o prefixo dessa cópia para consultar a execução atual. `reports/team-availability/current-gate.json` é a referência final desta entrega, mesmo que o JSON conserve o identificador histórico de runner `044`.

Inventário e hashes: `ARQUIVOS-ALTERADOS-DISPONIBILIDADE-EQUIPE-ASSISTIDO.md` e `docs/team-availability/integrity.json`. O código entregue é o código executado no gate; após o PASS foram acrescentados somente documentação e organização das evidências.

## Uso e atualização

- Atualização incremental sem reset: `docs/team-availability/upgrade.md`.
- Configuração, unidade de consumo e contrato do ciclo: `docs/team-availability/configuration.md`.
- Matriz requisito → teste: `docs/team-availability/test-matrix.md`.
- Evidências desktop/mobile: `reports/team-availability/screenshots/`.
- Traces dos oito cenários novos: `reports/team-availability/traces/`.

## Limite da validação

Execução local com PGlite, fixtures HTTP, Auth simulado e Chromium 153, exclusivamente com dados fictícios. Isso não comprova Supabase/Auth/SMTP/Storage/PostgREST reais, cache de esquema remoto, carga, concorrência em conexões PostgreSQL nativas ou restauração externa. Esses itens permanecem **PENDENTES DE HOMOLOGAÇÃO EXTERNA**, conforme as instruções permanentes do projeto. Nenhuma homologação externa foi iniciada.

## PENDENTE DO PROPRIETÁRIO

1. Quantidade incluída de atendimentos compartilhados por ciclo.
2. Horário comercial definitivo da Equipe SYZIA.
3. Eventual política futura de excedente.

Nenhum desses três itens foi decidido nesta rodada. A configuração humana permanece pendente até essas definições; não há promessa de atendimento ilimitado ou 24 horas.

**SYZIA — FEATURE FREEZE RESTABELECIDO.** Trabalho encerrado após esta entrega. Fechamento comercial, provider/checkout, homologação externa e lançamento permanecem etapas separadas, sem execução automática.
