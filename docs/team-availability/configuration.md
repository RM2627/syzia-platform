# Configuração de disponibilidade e Assistido

## Funcionários próprios

Em **Pessoas e acessos → Permissões por pessoa → Disponibilidade para atendimentos**, selecione o funcionário. Também é possível acessar a área de permissões já existente.

- **Usar horário geral da empresa** começa ativo. A Agenda continua usando o horário publicado vigente e os mesmos recursos/regras existentes.
- Desative para definir um ou mais intervalos por dia. Um dia sem intervalos significa **Não atende**. Os horários usam o fuso da empresa; intervalos devem começar e terminar no mesmo dia, sem sobreposição.
- **Indisponibilidade pontual** permite data inteira ou intervalo naquela data. O servidor converte usando o fuso da empresa, independentemente do fuso do dispositivo. Não há férias, ponto ou RH.
- Salve. Caso existam reservas futuras fora da disponibilidade, a tela avisa a quantidade. A empresa decide expressamente como tratar cada compromisso.

Na ficha da Agenda, **Responsável por este período** permite selecionar, trocar ou remover a pessoa. A atribuição é opcional e exige o grant existente de gestão da Agenda. A validação inclui o período reservado inteiro, inclusive buffer. Em múltiplos períodos, cada ficha conserva sua própria atribuição.

O replanejamento preserva os responsáveis por número da parte. Se remover uma parte atribuída, a operação é negada e pede revisão explícita da atribuição antes de prosseguir. Partes novas começam sem responsável individual, conforme a semântica opcional. Não existe distribuição automática de equipe. O recurso único da empresa e sua exclusão de sobreposição continuam iguais à base.

Administradores/gestores dependem de `people.manage`; não há novo bloqueio de plano. Identidades da Equipe SYZIA global não aparecem como funcionários próprios. Edição via URL/RPC também exige autorização atual.

## Assistido SYZIA

O **Super Admin → Planos e assinaturas → Atendimento compartilhado** reúne:

1. **Horário global**: ativo/inativo, timezone IANA (por exemplo, America/Sao_Paulo), intervalos semanais e mensagem fora do horário.
2. **Limite por versão do plano**: quantidade incluída e quantidade consumida a partir da qual avisar. Ambos vazios indicam configuração pendente. Zero significa nenhuma nova unidade compartilhada. O aviso deve ficar entre zero e o limite. Nenhum número comercial é pré-preenchido pela migration.
3. **Ciclo informado pela assinatura**: a primeira utilização pode aproveitar o período vigente da assinatura. Para um ciclo explícito, selecione empresa e versão, início/fim e referência única. As entradas de data nessa tela usam o fuso do dispositivo, identificado no rótulo, e são enviadas como instantes UTC. Ciclos usam intervalo [início, fim), não se sobrepõem, e a mesma referência não reinicia consumo.
4. **Consumo e auditoria**: consulta por empresa, eventos de consumo e revisões de configuração. Mudar limite/aviso não apaga nem zera consumo. O limite é o da versão vinculada ao ciclo; a versão do ciclo não muda silenciosamente em upgrade/downgrade.

A empresa consulta seu uso e ciclos anteriores em **Plano e assinatura**. Não edita política global, limite ou ciclo. A Equipe SYZIA conserva todas as restrições de autonomia e preço existentes.

### Definição exata de uma unidade

Uma unidade é **um ticket distinto atribuído à Equipe SYZIA em um ciclo da empresa**. O primeiro claim ou transferência para a equipe registra `(ciclo, ticket)` no ledger imutável. Outro atendente compartilhado, cinco mensagens, retorno à fila ou reassunção do mesmo ticket no mesmo ciclo não criam outra unidade. No ciclo seguinte, a retomada compartilhada daquele ticket pode consumir uma unidade nesse novo ciclo.

Tickets já atribuídos antes da migration não recebem consumo retroativo. Sua primeira ação humana compartilhada após a atualização registra a unidade no ciclo vigente — retomada do ticket legado. O mesmo mecanismo registra a primeira retomada em um ciclo novo. Uma mensagem enviada pelo consumidor nunca gera consumo compartilhado.

Ao atingir o limite, tickets já contabilizados no ciclo podem continuar sendo atendidos dentro do horário; somente tickets ainda não contabilizados são recusados para nova atuação compartilhada. A própria empresa continua atendendo. Solicitações, mensagens do consumidor, FAQ e autoatendimento continuam funcionando, inclusive fora do horário.

Fora do horário, comandos humanos compartilhados ficam negados; não há promessa de resposta humana imediata. A fila permanece registrada para retomada explícita no próximo período. Não foi criada automação de despacho ou promessa 24 horas.

### Contrato do ciclo para integração futura

`assisted_cycle_start(p_org, p_version, p_start, p_end, p_reference)` recebe instantes e referência sem nome de provedor. Exige Super Admin na autorização atual, retorna o ID do ciclo e detecta repetição conflitante. Uma integração futura deverá usar um gateway server-side devidamente autorizado para esse comando/domínio; nenhuma credencial privilegiada vai para o frontend. O domínio e o ledger não precisam ser reconstruídos para receber períodos de assinatura. Webhook/provider/checkout não foram implementados.

## PENDENTE DO PROPRIETÁRIO

1. Quantidade incluída de atendimentos compartilhados por ciclo.
2. Horário comercial definitivo da Equipe SYZIA, incluindo o fuso escolhido.
3. Eventual política futura de excedente.

Nenhum desses itens foi decidido nesta rodada.
