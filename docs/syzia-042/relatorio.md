# SYZIA 042 — relatório técnico

Data: 26/09/2026. Base exclusiva: SYZIA 041 consolidada. Escopo autorizado: `request.md`. Esta entrega encerra a rodada local e aguarda a homologação manual curta do proprietário.

## CORRIGIDO NESTA RODADA

### Identidade e autorização

A Equipe SYZIA aparece separada dos funcionários próprios, com situação e permissões relativas à empresa. O ADM empresarial não recebe ações nem dados de administração da identidade global. Pode revisar autonomia e grants locais pelos fluxos existentes.

A classificação global tem precedência sobre memberships empresariais legados. Isso impede que uma atribuição compartilhada revogada volte a autorizar operações por um vínculo antigo. Os comandos de acesso, reemissão/reset, edição, status e papel também verificam essa fronteira no servidor; esconder os botões é apenas a apresentação. Super Admin conserva sua autoridade global, e os funcionários próprios conservam a administração empresarial existente.

A autonomia operacional agora considera grants, capacidade, vínculo, escopo, estado e as permissões atuais e publicadas. Uma revogação atual bloqueia a próxima operação; uma ampliação ainda não publicada não concede poder. Faixa de preço exige limite superior explícito publicado. A informação de condições publicadas não permite negociar valores arbitrários. Desconto compartilhado depende de regra e teto, e continua sem conceder acesso à calculadora de preço variável.

### Home operacional

Foi reproduzida uma incompatibilidade da RPC `operations_home` da 041: declarada `STABLE`, chama a Agenda, que insere um contexto temporário de autorização. Em transação somente leitura, a chamada falha com SQLSTATE `25006`. A 042 declara corretamente a operação como `VOLATILE` e acrescenta carregamento independente por seção. O diagnóstico é comprovado localmente; não se afirma acesso aos logs do incidente externo do proprietário.

A Home reúne Agenda de hoje, próximo atendimento, andamento, itens que exigem atenção, amanhã e acessos aos fluxos existentes. Propostas aprovadas ainda sem agenda abrem o próprio contexto de orçamento/agendamento. Retornos abrem a oportunidade correspondente. Falha em uma seção mantém as outras; a repetição é localizada, e falta de autorização tem mensagem diferente de falha de rede. Métricas continuam no módulo próprio.

### Proposta e comunicação da Agenda

A explicação da proposta é opcional para uma composição simples sem mudança relevante. Alteração de preço, composição, desconto ou condição exige explicação no servidor e na interface; o campo e o motivo do botão bloqueado ficam visíveis. Prévia, pedido original e versões enviadas permanecem preservados.

A duração é apresentada em horas/minutos. A consulta distingue ausência de capacidade e duração que não cabe no expediente conhecido, com busca de próximos horários compatíveis. Depois da aprovação, o consumidor recebe a orientação de escolher ou confirmar o horário, mantendo a proposta aprovada e a preferência original quando aplicável.

### Execução em vários períodos

Execução contínua permanece como padrão. A empresa pode publicar um serviço como divisível, com limite opcional de períodos. Sem limite configurado, a busca possui teto técnico de 30 períodos, dentro do horizonte já configurado na Agenda. O consumidor recebe combinações prontas; não distribui horas manualmente.

O motor reutiliza funcionamento, capacidade, bloqueios, antecedência, horizonte, grade e buffers existentes. Cada período passa pela validação de disponibilidade. Todos os períodos são revalidados e gravados na mesma transação, sob o bloqueio de reserva existente, com a constraint de capacidade preservada. Um plano alterado exige nova escolha; conflito ou erro impede reserva parcial.

Continua havendo um pedido, um cliente e um contexto comercial. A extensão mínima associa appointments ao grupo e ao número da parte. Consumidor e ficha empresarial mostram os períodos juntos; a Agenda mantém cada janela. Remarcar um período conserva os demais; replanejar substitui o conjunto com histórico; cancelar integralmente trata todas as partes. Execução iniciada e restrições de cancelamento continuam sendo verificadas.

Composição multissserviço só divide quando todas as regras permitem. A proposta enviada congela sua política de execução; versões antigas usam a política compatível da publicação. Concluir uma parte não conclui a contratação inteira. Métricas e valor realizado contam a contratação uma vez após a última parte; aprovação e execução não viram pagamento recebido.

### Persistência e preservação

Há somente uma migration nova, incremental e transacional: `202609260042_operational_refinements.sql`. Ela estende serviços, versões de proposta, solicitações e appointments; ajusta funções, autorização e índices necessários. Não cria agenda, cliente, ticket ou sistema de identidade paralelo.

As 38 migrations existentes até a rodada 041 e os 23 arquivos em `public/brand/` foram comparados com o ZIP original e preservados byte a byte. A numeração das rodadas não implica uma migration para cada número: não foram inventados arquivos 034/035/037. Nenhum arquivo da base foi removido. O teste de upgrade preservou linhas e colunas anteriores de 119 tabelas da fixture populada. Não houve reset de banco empresarial, publicação de conteúdo, dados reais, cobrança ou deploy.

## TESTADO LOCALMENTE

| Verificação | Resultado | Evidência |
|---|---:|---|
| SQL 042, upgrade e autorização | 47 PASS | `reports/syzia-042/sql.json` |
| Regressão necessária 040 com 042 aplicada | 35 PASS | `reports/syzia-042/regression-040.json` |
| Regressão necessária 041 com 042 aplicada | 35 PASS | `reports/syzia-042/regression-041.json` |
| Interface no Chromium, desktop/mobile | 7 PASS | `reports/syzia-042/browser.json` |
| Typecheck e build | PASS | `reports/syzia-042/build.log` |
| Verificação do bundle | PASS | `reports/syzia-042/bundle.log` |
| Migrations e marca anteriores | PASS | `reports/syzia-042/base-integrity.json` |

Total: **124 casos automatizados aprovados**, além de build/typecheck, bundle e integridade. SQL executado em PGlite, com fixtures de Auth e dados fictícios. O navegador usa a aplicação React e RPCs locais reais dessa fixture. Os cenários de erro de rede/autorização e estado vazio da Home usam interceptações explicitamente controladas no teste. Não representam incidentes externos capturados.

Os testes verificam plano obsoleto, colisões reproduzidas em sequência, adulteração de duração e rollback após falha injetada na segunda gravação. Esses testes comprovam os casos locais descritos, mas não substituem concorrência entre conexões de um PostgreSQL externo.

A regressão reaplica as suítes 040/041 sobre a 042. As comparações de upgrade consideram apenas as colunas anteriores, e a regressão 040 aceita a nova causa específica de bloqueio global junto da negação anterior. A obrigação de negar a ação permanece. Os arquivos originais dessas suítes foram preservados.

`cobertura-testes.md` relaciona os 62 itens exigidos aos casos executados. `evidencias.md` lista as capturas da interface; todas contêm dados fictícios. Os resultados históricos de outras rodadas no consolidado são histórico, não execuções adicionais desta rodada.

## PENDENTE DE HOMOLOGAÇÃO EXTERNA

- Homologação manual curta do proprietário, no ambiente escolhido, seguindo `guia-upgrade.md`.
- Aplicação real da migration sobre uma cópia controlada do banco do proprietário, medição de tempo/locks e confirmação do cache de schema do PostgREST.
- RPCs/RLS sob Auth, sessões e gateway reais, inclusive revogação em sessão aberta e isolamento A/B.
- Concorrência independente para reserva/replanejamento/cancelamento de vários períodos; desempenho com volume e horizonte reais.
- Backup/restauração e comportamento das integrações já existentes de e-mail, anexos/Storage e links no ambiente externo.

A tentativa de PostgreSQL nativo local foi **BLOQUEADA**: o ambiente não conseguiu mapear um UID não root. `native.log` registra o motivo. Não houve teste nativo de concorrência nem homologação Supabase/PostgREST real nesta rodada. Pagamentos e providers externos não foram executados ou certificados.

## PENDENTE DA BATERIA FINAL

A auditoria/bateria ampla da plataforma inteira **não foi executada**, conforme solicitado. Permanece para autorização posterior à homologação manual alinhada, incluindo módulos e combinações não cobertos pelos testes focados desta rodada. A 043 não foi iniciada. A entrega encerra a atuação desta rodada.
