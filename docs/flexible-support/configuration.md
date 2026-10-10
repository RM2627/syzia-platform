# Configurar os dois modos de suporte compartilhado

A Equipe SYZIA presta apoio compartilhado no atendimento, conforme disponibilidade e dentro da autonomia concedida pela empresa. A própria empresa mantém seu atendimento e seus funcionários. A disponibilidade individual criada na 045 permanece em Pessoas e acessos e não depende desta política global.

## Super Admin

Em **Planos e assinaturas → Atendimento compartilhado → Horário global da Equipe SYZIA**, escolha o **Modelo de disponibilidade** e salve:

| Modo | Funcionamento |
|---|---|
| Conforme disponibilidade da equipe | Modo destinado ao lançamento. Não exige grade semanal; a presença operacional da Central identifica quem pode receber novos tickets. |
| Horário programado | Usa os dias, intervalos, timezone e mensagem fora do horário da 045. A política precisa estar ativa e dentro da janela configurada para atuação compartilhada. A presença continua necessária para assumir/receber um novo ticket. |

O botão ativo/inativo continua existindo nos dois modos. Ativar o modo flexível não preenche horário ou quota. A grade guardada não é apagada ao mudar para flexível; ao voltar ao programado ela reaparece. Uma política programada ativa exige pelo menos um intervalo válido. A mensagem fora do horário continua configurável para o modo programado.

A migration conserva como programada qualquer política 045 que já esteja ativa ou tenha intervalos. Uma política ainda inativa e vazia recebe modo flexível, permanecendo inativa. Para usar o modelo de lançamento em uma instalação que já tinha grade, o Super Admin escolhe explicitamente **Conforme disponibilidade da equipe**. Não há ativação silenciosa.

## Presença da Central

Cada integrante usa **Minha presença**, já existente na Central:

- **Disponível**: pode assumir/receber novo atendimento se identidade, atribuição, grants, plano, política e limite permitirem.
- **Ocupado**, **Em pausa** ou **Offline**: não recebe novo atendimento compartilhado. Um atendimento já assumido pode continuar quando a política permite; mudar a presença não devolve, encerra ou apaga tickets automaticamente.

É uma presença operacional declarada no mecanismo existente. Não foi criado ponto, controle de horas, escala, heartbeat, despacho automático ou monitoramento de jornada. A informação exibida se atualiza com as consultas já existentes da Central/consumidor.

A transferência exige destinatário compartilhado Disponível. As regras da equipe própria permanecem as da base. As permissões são revalidadas no servidor, inclusive após revogação e em RPC direta.

## Fila, consumo e limite

**Entrar na fila = zero unidades. Mensagem do consumidor = zero unidades.**

**Uma unidade = um ticket distinto efetivamente assumido ou recebido por transferência pela Equipe SYZIA dentro do ciclo da empresa.** Cinco mensagens, reassumir ou transferir entre integrantes no mesmo ciclo não multiplicam consumo. A chave `(ciclo, ticket)`, os ciclos e o registro imutável da 045 permanecem iguais.

Ao atingir o limite, um ticket ainda não contabilizado não recebe nova atuação compartilhada. Um ticket já contabilizado pode continuar, respeitando o modo/política e as demais autorizações. A empresa própria e o consumidor continuam usando a plataforma. Não existe cobrança por excedente nesta rodada.

No modo flexível, sem integrante disponível, o ticket elegível fica aguardando apoio sem atribuição fictícia. A empresa visualiza esse estado na ficha da Central. Solicitações, mensagens, FAQ, contratação e acompanhamento continuam funcionando.

Em **Plano e assinatura**, o ADM empresarial consulta consumo, estado de limite, modo aplicável e, quando programado, os horários/fuso. Não edita a política global. O Super Admin mantém limite/aviso por versão, consumo por empresa, ciclos e auditoria no mesmo local da 045.

## Mensagem ao consumidor

No modo flexível: **“Recebemos sua mensagem. A equipe responsável responderá assim que estiver disponível.”**

A mensagem não expõe nomes ou estados individuais, não informa prazo e não altera a autorização do campo de envio. No modo programado fora da janela, a mensagem configurada da 045 é preservada. O proprietário deve manter qualquer texto personalizado coerente com o modelo de suporte compartilhado.

## Contratos e compatibilidade

A nova RPC `assisted_policy_mode_save` salva modo, grade, timezone, mensagem e ativo/inativo atomicamente, usando a revisão existente e a mesma auditoria. A RPC `assisted_policy_save` de cinco argumentos continua aceitando clientes 045 e preserva sua semântica de política programada. Não há overload ambíguo.

O ciclo/provider-neutral, os comandos de quota e o registro de consumo não foram reconstruídos. A disponibilidade dos funcionários, a Agenda e as funções de reserva/replanejamento não foram alteradas nesta rodada.

## Pendente do proprietário

A quantidade definitiva por ciclo e eventual política futura de excedente continuam pendentes. Para o lançamento flexível, não existe obrigação de definir horário comercial. Um horário futuro será decisão própria somente se o modo programado for adotado. Checkout/provider, homologação externa e lançamento não foram iniciados.
