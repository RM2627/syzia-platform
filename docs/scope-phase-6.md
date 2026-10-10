AUTORIZAÇÃO EXPRESSA — INICIAR SOMENTE A FASE 6

A Fase 5 — Central de Atendimento Humano — está APROVADA para continuidade do desenvolvimento.

Pode iniciar a FASE 6 — COMERCIAL, FOLLOW-UP E RECUPERAÇÃO DE OPORTUNIDADES.

IMPORTANTE SOBRE A ESTRATÉGIA ATUAL

Neste momento, NÃO quero interromper o desenvolvimento para realizar homologação externa em Supabase real.

Minha prioridade é primeiro concluir o projeto completo, passando pelas Fases 6, 7 e 8. Depois da entrega completa, faremos a homologação externa, configuração do Supabase real, testes externos, preparação de produção e lançamento.

As pendências externas documentadas nas fases anteriores devem continuar registradas e preservadas, mas NÃO devem bloquear o desenvolvimento local das próximas fases.

Não realizar deploy, publicação, lançamento, contratação de serviços pagos, uso de clientes reais ou conexão com o banco real da MS Auto Details.

---

# OBJETIVO DA FASE 6

Transformar oportunidades, orçamentos, solicitações, agendamentos e atendimentos já existentes em um fluxo comercial organizado capaz de identificar clientes que precisam de retorno e ajudar a empresa/equipe humana a recuperar oportunidades que poderiam ser perdidas.

A plataforma deve ajudar a responder:

- Quem demonstrou interesse e ainda não avançou?
- Quem pediu orçamento e não respondeu?
- Quem iniciou uma solicitação e abandonou?
- Quem precisa receber retorno?
- Qual é a próxima ação comercial?
- Quando esse retorno deve acontecer?
- Quantas tentativas já foram realizadas?
- O cliente respondeu?
- A oportunidade avançou, foi perdida ou convertida?
- Por que uma oportunidade foi perdida?
- Existe alguma tarefa comercial vencida?
- O atendente tem autorização para executar a ação?

A Fase 6 NÃO é um CRM complexo e NÃO deve criar sistemas paralelos aos módulos já existentes.

---

# 1. REUTILIZAR TODA A ESTRUTURA EXISTENTE

Antes de implementar:

- inspecionar o projeto completo atual;
- preservar as migrations 001–013;
- preservar contratos, RLS, RPCs, motores e testes aprovados;
- reutilizar customers, opportunities, requests, quotes, appointments, tickets, consents, manual, autonomy, audit e demais estruturas existentes;
- não recriar cliente, orçamento, agenda, ticket ou oportunidade em estruturas paralelas;
- não alterar silenciosamente contratos validados das Fases 2–5.

A Fase 6 deve ser uma evolução cumulativa do projeto.

---

# 2. FUNIL COMERCIAL SIMPLES

Consolidar a oportunidade como unidade comercial.

O fluxo deve suportar, conforme aplicável:

novo interesse
→ solicitação
→ orçamento
→ aguardando cliente
→ negociação/retorno
→ aprovado
→ agendamento
→ convertido

E também saídas como:

- perdido;
- recusado;
- expirado;
- cancelado;
- sem resposta;
- não elegível.

Não forçar todas as empresas a utilizar exatamente o mesmo caminho quando determinada etapa não se aplica.

Registrar transições reais.

Nunca inventar progresso futuro.

---

# 3. CENTRAL COMERCIAL

Criar uma área operacional clara para acompanhamento comercial.

Pode ser integrada à Central existente e/ou possuir uma visão comercial própria, desde que não crie arquitetura redundante.

A equipe deve conseguir visualizar pelo menos:

- oportunidades novas;
- aguardando primeiro contato;
- orçamentos aguardando resposta;
- retornos de hoje;
- retornos atrasados;
- clientes que responderam;
- solicitações abandonadas elegíveis;
- agendamentos pendentes;
- oportunidades próximas da conversão;
- oportunidades perdidas;
- convertidas recentemente.

Mostrar claramente:

empresa,
cliente,
serviço/interesse,
origem,
estado,
valor quando existente,
último contato,
próxima ação,
prazo,
tentativas,
responsável.

---

# 4. FOLLOW-UP CONFIGURÁVEL

Implementar o mecanismo de follow-up previsto na arquitetura.

A empresa deve poder configurar regras por:

1. regra específica;
2. serviço;
3. empresa;
4. padrão do sistema.

Precedência:

regra específica > serviço > empresa > padrão do sistema.

Permitir intervalos como:

- 2 horas;
- 6 horas;
- 24 horas;
- 48 horas;
- intervalo personalizado.

Não hardcodar somente esses valores.

Permitir configurar número máximo de tentativas.

Padrão inicial: 2 tentativas quando não houver configuração diferente.

---

# 5. FOLLOW-UP NÃO É SPAM

Uma oportunidade só pode entrar em recuperação quando houver base operacional válida para isso.

Considerar:

- existência de solicitação/interesse persistido;
- contato utilizável;
- consentimentos aplicáveis;
- finalidade do contato;
- estado atual;
- limite de tentativas;
- cancelamento/recusa;
- revogação;
- encerramento;
- conversão.

Contato operacional e marketing continuam sendo finalidades diferentes.

Não transformar consentimento operacional em autorização genérica de marketing.

---

# 6. TAREFAS COMERCIAIS

Criar tarefas comerciais estruturadas.

Exemplos:

- fazer primeiro contato;
- retornar orçamento;
- verificar decisão;
- recuperar solicitação;
- confirmar interesse;
- acompanhar aprovação;
- tratar pendência;
- retorno solicitado pelo cliente.

Cada tarefa deve possuir, quando aplicável:

- organização;
- oportunidade;
- cliente;
- ticket;
- responsável;
- tipo;
- estado;
- prioridade;
- data/hora prevista;
- origem da regra;
- tentativa atual;
- máximo de tentativas;
- resultado;
- timestamps.

Evitar tarefas duplicadas para o mesmo evento/regra.

---

# 7. MINHA LISTA COMERCIAL

O atendente deve possuir uma visão prática de trabalho.

Exemplos:

HOJE

- retornos vencidos;
- retornos agora;
- novos contatos;
- clientes que responderam;
- propostas aguardando retorno.

PRÓXIMOS

- tarefas futuras;
- follow-ups programados.

FINALIZADOS

- convertidos;
- perdidos;
- encerrados.

A interface deve priorizar ação, e não gráficos decorativos.

---

# 8. RESULTADO DO FOLLOW-UP

Após uma tentativa, permitir registrar resultado estruturado.

Exemplos:

- cliente respondeu;
- aguardando decisão;
- pediu retorno depois;
- interessado;
- orçamento aprovado;
- agendamento realizado;
- sem resposta;
- recusou;
- perdeu interesse;
- valor não aceito;
- escolheu concorrente;
- serviço não necessário;
- contato inválido;
- outro.

Quando “outro” for utilizado, permitir observação curta.

Não inferir automaticamente motivo a partir de texto livre.

---

# 9. MOTIVOS DE PERDA

Permitir registrar motivo estruturado quando oportunidade for perdida.

A lista deve ser simples e administrável.

Exemplos:

- preço;
- prazo;
- disponibilidade;
- localização;
- desistência;
- concorrente;
- sem resposta após limite;
- serviço não oferecido;
- contato inválido;
- outro.

Preservar histórico e auditoria.

Uma oportunidade perdida pode futuramente gerar nova oportunidade se o cliente retornar, sem apagar a anterior.

---

# 10. CONVERSÃO

Considerar conversão somente a partir de evento real definido pelo produto.

Não marcar conversão apenas porque houve conversa.

A arquitetura deve permitir critérios coerentes como:

- orçamento aprovado;
- agendamento confirmado;
- serviço concluído;

conforme o tipo de fluxo.

Registrar o evento que originou a conversão.

Não duplicar receita nem criar módulo financeiro completo nesta fase.

---

# 11. RECUPERAÇÃO DE ORÇAMENTO

Quando um orçamento enviado permanecer sem resposta e estiver elegível:

- criar/programar próxima ação;
- respeitar regra da empresa/serviço;
- respeitar consentimento;
- respeitar máximo de tentativas;
- interromper quando houver resposta, aprovação, recusa, expiração relevante, conversão ou revogação.

Não enviar mensagens automaticamente por WhatsApp nesta fase.

A plataforma organiza o trabalho humano.

---

# 12. SOLICITAÇÃO ABANDONADA

Somente tratar abandono quando houver dados persistidos suficientes e contato autorizado/utilizável.

Não considerar simples visita à página como lead recuperável.

Não criar identificação invasiva.

Telefone continua NÃO sendo autenticação.

Não tentar recuperar visitante anônimo sem base válida.

---

# 13. CLIENTE RESPONDEU

Quando o cliente responder durante um fluxo de follow-up:

- interromper retorno automático/pendente incompatível;
- atualizar tarefa;
- despertar ticket/oportunidade;
- colocar o atendimento novamente em posição adequada;
- preservar histórico.

Evitar que uma tarefa antiga mande o atendente entrar em contato com alguém que acabou de responder.

---

# 14. INTEGRAÇÃO COM A CENTRAL DA FASE 5

A Fase 6 deve aproveitar a Central.

O atendente deve conseguir sair da tarefa comercial diretamente para o atendimento correspondente.

O contexto deve mostrar:

- motivo do retorno;
- histórico;
- orçamento;
- serviço;
- agenda;
- últimas interações;
- tentativas;
- próxima ação;
- autonomia aplicável.

Não duplicar conversa.

---

# 15. RESPOSTAS RÁPIDAS PARA RETORNO

Permitir utilizar respostas rápidas autorizadas da empresa durante follow-up.

Elas podem possuir categorias como:

- primeiro contato;
- orçamento;
- lembrete;
- retorno;
- agendamento;
- encerramento.

Continuam sendo mensagens humanas.

Não implementar IA generativa ou chatbot.

---

# 16. RESPONSABILIDADE

Uma tarefa comercial pode estar:

- sem responsável;
- atribuída;
- em execução;
- aguardando cliente;
- reagendada;
- concluída;
- cancelada.

Somente pessoas autorizadas naquela organização podem assumir ou executar.

Transferências devem ser auditadas.

Presença não concede autorização.

---

# 17. CONCORRÊNCIA E IDEMPOTÊNCIA

Proteger:

- duas pessoas assumindo a mesma tarefa;
- execução duplicada;
- dois resultados concorrentes;
- follow-up criado duas vezes;
- resposta do cliente concorrendo com tentativa;
- conversão concorrendo com encerramento;
- oportunidade sendo perdida e convertida simultaneamente;
- revisão antiga sobrescrevendo estado novo.

Usar proteção transacional/idempotente no backend.

---

# 18. CONFIGURAÇÃO PELA EMPRESA

Criar configuração comercial simples no painel da empresa.

Permitir, conforme necessário:

- habilitar/desabilitar recuperação;
- intervalos;
- número máximo de tentativas;
- regras por serviço;
- tipos elegíveis;
- horários permitidos;
- motivos de perda;
- comportamento após ausência de resposta;
- autonomia aplicável.

Mudanças devem ser auditadas.

Não permitir que configuração nova altere silenciosamente histórico já realizado.

---

# 19. HORÁRIO DE CONTATO

Follow-up deve respeitar horário configurado para atendimento/comercial.

Se uma tarefa vencer fora da janela permitida, mover a execução para a próxima janela válida conforme regra determinística.

Considerar fuso da empresa.

Não enviar/solicitar contato em horário inadequado simplesmente porque um timer venceu.

---

# 20. HISTÓRICO COMERCIAL

Criar timeline comercial baseada em eventos reais.

Exemplo:

interesse criado
→ solicitação enviada
→ orçamento criado
→ orçamento enviado
→ follow-up programado
→ tentativa realizada
→ cliente respondeu
→ orçamento aprovado
→ agendamento realizado
→ convertido.

Ou:

orçamento enviado
→ tentativa 1
→ sem resposta
→ tentativa 2
→ sem resposta
→ oportunidade perdida.

Nunca fabricar eventos.

---

# 21. ORIGEM DO CLIENTE

Utilizar a origem já preparada anteriormente:

- Instagram;
- Google;
- indicação;
- WhatsApp;
- direto;
- outro.

Não criar sistema avançado de atribuição de marketing.

Relação simples de indicação existente deve ser preservada.

Não implementar cashback, carteira, pontos ou saque.

---

# 22. VISÃO DA EMPRESA

O dono da empresa deve conseguir acompanhar suas próprias oportunidades e tarefas comerciais, respeitando isolamento.

Mostrar informações úteis como:

- oportunidades abertas;
- aguardando cliente;
- retornos pendentes;
- atrasados;
- convertidos recentes;
- perdidos recentes.

Não transformar isso ainda no módulo analítico completo da Fase 7.

---

# 23. BUSCA E FILTROS

Permitir busca/filtro por:

- empresa;
- cliente;
- serviço;
- estado;
- responsável;
- origem;
- data;
- próxima ação;
- atraso;
- convertido/perdido;
- motivo de perda.

Sempre respeitar autorização e isolamento.

---

# 24. AUDITORIA

Registrar eventos relevantes:

- criação de tarefa;
- atribuição;
- transferência;
- tentativa;
- reagendamento;
- conclusão;
- cancelamento;
- resposta;
- conversão;
- perda;
- motivo;
- mudança de regra;
- alteração de limite;
- ação administrativa.

Evitar colocar corpo integral de mensagens ou dados sensíveis desnecessários em logs.

---

# 25. PRIVACIDADE

Preservar os controles anteriores.

Não expor:

- notas internas ao consumidor;
- dados de outra empresa;
- informações administrativas não compartilhadas;
- tokens;
- segredos;
- service role;
- dados de pagamento;
- rascunhos internos.

Aplicar RLS/FORCE RLS e validação no backend às novas estruturas.

---

# 26. TESTES OBRIGATÓRIOS

Adicionar testes automatizados e regressão para, no mínimo:

1. isolamento A/B;
2. atendente sem vínculo;
3. empresa suspensa;
4. atendente revogado;
5. tarefa duplicada;
6. duas assunções concorrentes;
7. execução concorrente;
8. revisão obsoleta;
9. regra específica sobre serviço;
10. serviço sobre empresa;
11. empresa sobre padrão;
12. limite de tentativas;
13. consentimento ausente;
14. consentimento revogado;
15. cliente respondeu antes do retorno;
16. orçamento aprovado antes do retorno;
17. orçamento recusado;
18. conversão;
19. perda;
20. reabertura por novo interesse;
21. horário permitido;
22. fuso;
23. tarefa atrasada;
24. transferência;
25. motivo de perda;
26. origem;
27. integração com ticket;
28. integração com orçamento;
29. integração com agenda;
30. notas internas não vazando;
31. busca/filtros;
32. idempotência;
33. manipulação de UUID/código;
34. acesso do consumidor;
35. regressão das Fases 2–5.

Realizar também:

- typecheck;
- build;
- bundle/security scan;
- regressão de migrations;
- inspeção visual desktop/tablet/mobile.

---

# 27. UX

A interface deve parecer uma ferramenta comercial profissional de trabalho diário.

Priorizar:

- clareza;
- velocidade;
- próxima ação;
- prazos;
- contexto;
- pouco clique;
- estados inequívocos.

Evitar dashboard cheio de gráficos sem utilidade operacional.

---

# 28. PREPARAÇÃO PARA FASE 7

A estrutura desta fase deve produzir eventos e dados confiáveis para futura medição de:

- oportunidades;
- conversões;
- perdas;
- tempo de resposta;
- follow-ups;
- origem;
- serviços;
- desempenho operacional.

Mas NÃO implementar nesta fase o módulo completo de métricas/analytics da Fase 7.

---

# 29. NÃO IMPLEMENTAR NA FASE 6

Não implementar agora:

- IA;
- chatbot;
- WhatsApp Business API;
- disparo automático externo;
- campanhas de marketing em massa;
- e-mail marketing;
- telemarketing;
- CRM complexo;
- funis arbitrários tipo enterprise;
- lead scoring por IA;
- automação avançada;
- cashback;
- carteira;
- pontos;
- programa de fidelidade completo;
- estoque;
- fiscal;
- ERP;
- folha;
- gateway real;
- Pix real;
- cartão real;
- custódia financeira;
- billing real da plataforma;
- aplicativo nativo;
- analytics completo da Fase 7;
- billing/pagamentos completos da Fase 8.

---

# 30. HOMOLOGAÇÃO EXTERNA

Atualizar/preparar o guia de homologação externa da Fase 6, mas NÃO exigir que ela seja executada agora.

Registrar claramente:

PENDENTE DE HOMOLOGAÇÃO EXTERNA.

Ela será realizada depois que o projeto completo estiver desenvolvido.

O guia deve incluir testes futuros para Supabase real, Auth/JWT, PostgREST/RLS, concorrência, revogação, tarefas, consentimentos, isolamento e demais controles aplicáveis.

---

# 31. ENTREGA COMPLETA OBRIGATÓRIA

A regra permanente continua válida.

Ao final da Fase 6, entregar o PROJETO COMPLETO ATUALIZADO, cumulativo das Fases 2–6.

Não entregar apenas patch, diff ou arquivos modificados.

Incluir:

- todo source;
- páginas;
- componentes;
- estilos;
- assets;
- package.json;
- lockfile;
- migrations 001 até a última;
- SQL;
- schemas;
- RLS;
- functions/RPCs;
- scripts;
- testes;
- fixtures;
- configurações;
- `.env.example`;
- `.env.server.example`, quando aplicável;
- README;
- AGENTS.md;
- documentação;
- inventário;
- guias;
- relatórios;
- evidências;
- matriz de testes;
- guia de homologação;
- tudo necessário para instalar, continuar, testar, configurar e futuramente implantar.

Nenhuma parte necessária pode existir apenas no ambiente do agente ou no histórico da conversa.

O projeto entregue é a fonte de verdade.

---

# 32. ENCERRAMENTO DA FASE

Ao concluir:

1. executar regressão completa;
2. corrigir falhas encontradas;
3. informar total real de testes únicos aprovados;
4. informar migrations adicionadas;
5. informar tabelas/RPCs/policies novas;
6. informar limitações conhecidas;
7. informar pendências externas;
8. entregar relatório da Fase 6;
9. entregar guia de homologação;
10. entregar projeto completo atualizado.

NÃO realizar deploy.

NÃO lançar a plataforma.

NÃO usar clientes reais.

NÃO conectar banco real da MS Auto Details.

NÃO contratar ou ativar serviços pagos.

NÃO iniciar a Fase 7 sem minha autorização expressa.

Ao terminar a Fase 6, PARAR e aguardar minha aprovação.