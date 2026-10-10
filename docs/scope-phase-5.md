FASE 5 — CENTRAL DE ATENDIMENTO HUMANO

A Fase 4 — Consumidor está APROVADA para continuidade do desenvolvimento.

Inicie agora SOMENTE a Fase 5 — Central de Atendimento Humano.

NÃO reinicie o projeto.

Antes de implementar, inspecione integralmente o estado atual do projeto entregue nas Fases anteriores e reutilize corretamente toda a arquitetura, banco, componentes, regras, segurança, contexto do consumidor, orçamentos, agenda, histórico, permissões, manual, autonomia e demais estruturas já existentes.

Preserve integralmente tudo que já estiver correto e validado.

A homologação externa das fases anteriores continua PENDENTE quando depender de Supabase real, Auth real, Storage, PostgREST, infraestrutura ou credenciais. Isso NÃO deve impedir o desenvolvimento local da Fase 5.

O objetivo desta fase é construir a CENTRAL DE ATENDIMENTO HUMANO COMPARTILHADO da plataforma.

A plataforma deverá permitir que uma equipe de atendentes humanos opere o atendimento de diversas empresas clientes a partir de uma única central, mantendo isolamento absoluto entre organizações e apresentando ao atendente somente as informações necessárias e autorizadas para resolver cada atendimento.

IMPORTANTE:

A arquitetura deve ser GENÉRICA e MULTIATENDENTE.

Ranna e Marcelo serão os primeiros usuários desse modelo operacional, mas seus nomes NÃO devem ser hardcoded no sistema.

A plataforma deve permitir futuramente adicionar, remover, suspender e organizar outros atendentes.

---

# 1. PRINCÍPIO DA CENTRAL

A Central deve permitir que um atendente resolva a maior parte dos atendimentos normais sem precisar perguntar tudo ao proprietário da empresa.

O atendente deverá ter acesso controlado a:

- empresa atendida;
- cliente;
- serviço de interesse;
- catálogo autorizado;
- preços autorizados;
- orçamento;
- agendamento;
- histórico;
- origem;
- contexto;
- manual publicado;
- FAQ;
- respostas rápidas;
- regras;
- autonomia concedida;
- observações operacionais autorizadas;
- próxima ação;
- pendências.

Princípio operacional:

SE SABE E TEM AUTORIZAÇÃO → RESOLVE.

SE NÃO SABE → NÃO INVENTA.

SE NÃO TEM AUTORIZAÇÃO → ENCAMINHA.

Nunca permitir que o atendente improvise preços, políticas, descontos ou decisões fora da autonomia concedida pela empresa.

---

# 2. CENTRAL ÚNICA MULTIEMPRESA

Criar uma Central de Atendimento onde um atendente autorizado consiga trabalhar com múltiplas empresas sem precisar entrar manualmente em cada painel administrativo.

A interface deve deixar extremamente claro:

- qual empresa está sendo atendida;
- qual cliente;
- qual solicitação;
- qual serviço;
- situação atual;
- responsável atual;
- prioridade;
- tempo de espera;
- próxima ação.

Evitar qualquer possibilidade visual ou técnica de confundir dados de empresas diferentes.

Trocar de atendimento NÃO pode carregar dados, respostas, preços ou contexto da empresa anterior.

---

# 3. MINHA FILA

Criar uma visão principal semelhante a “Minha Fila”.

Ela deverá concentrar os atendimentos que exigem ação daquele atendente.

Organizar de forma clara itens como:

- novos;
- atribuídos a mim;
- aguardando minha resposta;
- cliente respondeu;
- aguardando empresa;
- aguardando cliente;
- orçamento pendente;
- agendamento pendente;
- acompanhamento necessário;
- atrasados;
- resolvidos recentemente.

Permitir ordenação/priorização apropriada por:

- urgência operacional;
- tempo de espera;
- estado;
- empresa;
- responsável;
- próxima ação.

Não criar um algoritmo opaco ou IA para decidir prioridade.

As regras devem ser determinísticas e compreensíveis.

---

# 4. PAINEL “HOJE”

Criar uma visão operacional rápida do dia.

Exemplos de informações:

- novos atendimentos;
- clientes esperando;
- atendimentos atrasados;
- retornos necessários;
- agendamentos de hoje;
- orçamentos aguardando ação;
- pendências com empresas;
- atendimentos resolvidos;
- carga atual do atendente.

A intenção é que o atendente consiga abrir a plataforma pela manhã e entender rapidamente:

“O que preciso resolver agora?”

Não implementar ainda métricas avançadas da Fase 7.

---

# 5. TICKET COMO UNIDADE DE ATENDIMENTO

Preserve a decisão arquitetural de utilizar TICKET como unidade principal de atendimento no MVP.

Não criar desnecessariamente outra camada paralela de “conversation” se o modelo atual de tickets + mensagens + eventos consegue atender ao requisito.

Cada ticket deverá estar relacionado, quando aplicável, a:

- organização;
- cliente;
- solicitação;
- oportunidade;
- orçamento;
- agendamento;
- serviço;
- atendente responsável;
- status;
- prioridade;
- origem;
- timestamps;
- próxima ação.

Evitar duplicação desnecessária de estado já existente.

---

# 6. CICLO DE VIDA DO ATENDIMENTO

Definir estados claros e consistentes.

Exemplo conceitual, refinando nomes conforme arquitetura existente:

- novo;
- em fila;
- atribuído;
- em atendimento;
- aguardando cliente;
- aguardando empresa;
- aguardando ação interna;
- resolvido;
- encerrado;
- reaberto quando apropriado.

Status devem possuir significado operacional claro.

Não criar dezenas de estados redundantes.

Toda mudança relevante deve gerar evento/histórico apropriado.

---

# 7. ATRIBUIÇÃO DE ATENDENTE

Permitir:

- ticket sem responsável;
- assumir atendimento;
- atribuição autorizada;
- transferência para outro atendente;
- devolver para fila quando apropriado;
- encaminhar para responsável da empresa;
- atendente backup quando configurado.

Registrar histórico de atribuições.

Não permitir que atendente não vinculado/autorizado àquela organização assuma seus atendimentos.

---

# 8. CONCORRÊNCIA ENTRE ATENDENTES

Evitar que dois atendentes respondam simultaneamente ao mesmo atendimento acreditando que são responsáveis por ele.

Implementar proteção apropriada contra:

- dupla atribuição;
- respostas conflitantes;
- atualização baseada em estado antigo;
- transferência simultânea;
- encerramento concorrente.

Utilizar controle transacional/revisão/versionamento quando necessário.

A interface deverá avisar quando o atendimento tiver sido assumido ou alterado por outro atendente.

Não depender somente do frontend para impedir concorrência.

---

# 9. TELA DE ATENDIMENTO

Ao abrir um atendimento, criar uma experiência organizada em áreas claras.

Sugestão conceitual:

CENTRO:
conversa/interação atual.

LATERAL:
contexto operacional.

TOPO:
empresa + cliente + estado + responsável + tempo.

AÇÕES:
orçamento, agenda, respostas rápidas, manual, encaminhamento etc.

O atendente deve conseguir trabalhar sem abrir dez páginas diferentes.

---

# 10. CONTEXTO DO CLIENTE

Apresentar somente informações necessárias e autorizadas.

Quando disponíveis:

- nome;
- contato;
- serviço de interesse;
- origem;
- cliente recorrente;
- solicitações anteriores relevantes;
- orçamento atual;
- agendamento atual;
- preferências operacionais;
- tags internas autorizadas;
- observações;
- timeline;
- próxima ação.

Não transformar a tela em CRM complexo.

Não expor dados pessoais desnecessários.

---

# 11. CONTEXTO DA EMPRESA

O atendente deve conseguir consultar rapidamente:

- nome;
- identidade;
- serviços;
- preços;
- adicionais;
- regiões;
- horários;
- meios de pagamento;
- FAQ;
- regras;
- manual publicado;
- políticas;
- respostas rápidas;
- autonomia.

Somente informações publicadas/autorizadas.

Rascunhos administrativos não devem ser utilizados pelo atendimento.

---

# 12. MANUAL OPERACIONAL INTEGRADO

Aproveitar integralmente o manual estruturado da Fase 3.

O atendente deve conseguir consultá-lo dentro da própria Central sem precisar navegar para o painel administrativo da empresa.

Criar busca/filtro determinístico quando apropriado.

Exemplos:

“atraso”

“desconto”

“cancelamento”

“pagamento”

“área atendida”

“garantia”

Não implementar IA ou busca semântica nesta fase.

---

# 13. AUTONOMIA DO ATENDENTE

Integrar as permissões de autonomia construídas na Fase 3.

Antes de permitir determinada ação, verificar autorização no backend/banco.

Exemplos:

- responder determinada questão;
- oferecer condição permitida;
- aplicar desconto dentro do limite;
- ajustar situação permitida;
- criar/alterar orçamento quando autorizado;
- auxiliar agendamento;
- cancelar/remarcar quando autorizado;
- encaminhar exceção.

A interface deve mostrar claramente quando:

AÇÃO AUTORIZADA

ou

PRECISA DE APROVAÇÃO DA EMPRESA.

Nunca depender apenas de esconder botão.

---

# 14. DESCONTOS E PREÇOS

Preserve a regra existente de preço.

Atendente não pode inventar preço.

Quando houver permissão para desconto:

- respeitar limite configurado;
- calcular no backend/banco;
- registrar responsável;
- registrar valor anterior;
- registrar valor final;
- registrar motivo quando necessário;
- auditar.

Tentativa de ultrapassar autonomia deve falhar no servidor/banco.

---

# 15. RESPOSTAS RÁPIDAS

Integrar respostas rápidas da empresa diretamente na Central.

Permitir:

- selecionar resposta;
- visualizar antes de enviar;
- editar apenas quando permitido;
- pesquisar por título/categoria;
- identificar empresa correta.

Não enviar automaticamente sem ação humana nesta fase.

Uma resposta rápida de Empresa A jamais pode aparecer como resposta autorizada da Empresa B.

---

# 16. COMUNICAÇÃO COM O CLIENTE

Implementar a camada interna de mensagens necessária para o atendimento dentro da plataforma.

Preservar histórico e autoria.

Diferenciar claramente:

- mensagem do cliente;
- mensagem do atendente;
- mensagem/sistema;
- nota interna;
- evento operacional.

NOTA INTERNA nunca deve aparecer para o consumidor.

Não implementar WhatsApp Business API nesta fase.

Se houver ação para WhatsApp externo/manual, ela deverá ser claramente tratada como canal externo e respeitar consentimentos e dados públicos/autorizados.

---

# 17. IDENTIDADE DO ATENDENTE

A comunicação deve permitir apresentação profissional.

Exemplo conceitual:

“Oi! Sou Ranna, do atendimento da [Empresa]. Vou te ajudar por aqui.”

Porém:

- nome vem do perfil real do atendente;
- empresa vem do ticket;
- texto pode ser configurável;
- não hardcode Ranna;
- não afirmar vínculo empregatício exclusivo com a empresa quando isso não for verdadeiro.

A plataforma é de atendimento compartilhado.

---

# 18. NOTAS INTERNAS

Permitir notas internas apropriadas.

Exemplos:

- cliente pediu retorno à tarde;
- confirmar disponibilidade com proprietário;
- cliente prefere Pix;
- aguardando foto;
- situação excepcional.

Notas internas:

- nunca aparecem para consumidor;
- possuem autor/data;
- respeitam organização;
- possuem auditoria adequada;
- não devem virar armazenamento indiscriminado de dados pessoais.

---

# 19. ENCAMINHAMENTO PARA A EMPRESA

Criar mecanismo claro para casos que o atendente não pode resolver.

Exemplos:

- preço excepcional;
- serviço fora do catálogo;
- reclamação relevante;
- decisão de garantia;
- negociação fora da autonomia;
- disponibilidade extraordinária;
- situação não prevista no manual.

O atendente deve conseguir:

ENCAMINHAR PARA EMPRESA

com:

- motivo;
- resumo;
- cliente;
- serviço;
- contexto;
- pergunta/decisão necessária;
- prioridade quando apropriado.

O ticket passa para estado equivalente a:

AGUARDANDO EMPRESA.

Quando a empresa responder/decidir, deve retornar para fluxo apropriado.

Não criar comunicação informal invisível ao histórico para decisões importantes.

---

# 20. FILA DA EMPRESA

No painel da empresa, criar visão das solicitações que exigem decisão dela.

Exemplos:

- aprovar exceção;
- informar preço;
- confirmar disponibilidade;
- decidir reclamação;
- responder questão não documentada.

A empresa não deve precisar navegar pela Central inteira dos atendentes.

Mostrar apenas pendências pertencentes à própria organização.

---

# 21. SLA E TEMPO DE ESPERA

Preparar controle operacional simples de tempo.

Exibir:

- quando ticket entrou;
- última mensagem do cliente;
- última ação do atendente;
- tempo aguardando;
- próximo prazo operacional quando houver.

Criar sinalização determinística, por exemplo:

NORMAL

ATENÇÃO

ATRASADO.

Não prometer ao cliente prazo que a empresa/plataforma não configurou.

Não implementar métricas avançadas da Fase 7.

---

# 22. PRESENÇA E CARGA DO ATENDENTE

Preparar estrutura simples para estados operacionais como:

- disponível;
- ocupado;
- pausa;
- offline.

E informações como:

- tickets ativos;
- tickets aguardando;
- carga atual.

Não implementar monitoramento invasivo de produtividade.

Não criar rastreamento de teclado, mouse, câmera ou atividade pessoal.

A finalidade é somente organização operacional da fila.

---

# 23. TURNO / SESSÃO DE TRABALHO

Aproveitar ou implementar adequadamente a estrutura de work sessions prevista na arquitetura.

Permitir registrar início/fim de sessão operacional quando necessário para:

- saber quem está disponível;
- distribuir trabalho;
- histórico operacional;
- métricas futuras.

Não transformar isso em sistema trabalhista/ponto eletrônico.

---

# 24. FILA COMPARTILHADA

Quando houver mais de um atendente autorizado, a Central deverá suportar:

FILA GERAL

e

MINHA FILA.

A fila geral apresenta tickets elegíveis ainda não assumidos ou transferíveis.

Minha Fila apresenta responsabilidade direta daquele atendente.

Evitar atribuição automática complexa inicialmente.

Se houver distribuição automática simples, deve ser determinística, configurável e facilmente desativável.

---

# 25. PRIORIZAÇÃO

Preparar critérios operacionais simples:

- cliente aguardando;
- tempo;
- agendamento próximo;
- empresa respondeu;
- orçamento aguardando ação;
- prioridade manual autorizada.

Não usar IA para decidir prioridade.

Não criar pontuação obscura.

---

# 26. BUSCA E FILTROS

Permitir localizar atendimento por elementos apropriados, por exemplo:

- cliente;
- empresa;
- ticket;
- status;
- serviço;
- atendente;
- data;
- origem.

A busca deve respeitar integralmente as permissões do usuário.

Nunca permitir descoberta de outra organização por tentativa de pesquisa.

---

# 27. AÇÕES RÁPIDAS DO ATENDENTE

Dentro do atendimento, disponibilizar conforme autorização:

- consultar manual;
- consultar serviço/preço;
- usar resposta rápida;
- solicitar informação;
- criar/revisar orçamento;
- consultar agenda;
- auxiliar agendamento;
- adicionar nota;
- alterar status;
- encaminhar para empresa;
- transferir atendimento;
- marcar próxima ação;
- resolver atendimento.

Não duplicar lógica de orçamento/agenda já existente.

Reutilizar as operações seguras das fases anteriores.

---

# 28. ORÇAMENTO PELA CENTRAL

Quando autorizado, permitir que o atendente auxilie/crie proposta usando a infraestrutura de orçamento existente.

Preservar:

- cálculo server-side;
- versionamento;
- snapshots;
- validade;
- imutabilidade de versão final;
- idempotência;
- preços autorizados;
- adicionais;
- perguntas;
- histórico.

Não criar um segundo sistema de orçamento exclusivo da Central.

---

# 29. AGENDAMENTO PELA CENTRAL

Quando autorizado, permitir consultar horários e auxiliar no agendamento/remarcação/cancelamento usando a infraestrutura existente.

Preservar:

- conflitos;
- duração;
- bloqueios;
- antecedência;
- regras;
- concorrência;
- rollback seguro;
- autorização.

Não criar agenda paralela.

---

# 30. PAGAMENTOS

Nesta fase, apenas exibir ao atendente o contexto financeiro PREPARADO na Fase 4 quando necessário.

Exemplos futuros:

- pagamento não requerido;
- pagamento externo;
- aguardando sinal;
- sinal informado;
- pagamento integrado futuro.

NÃO implementar gateway real nesta fase.

NÃO permitir que atendente marque pagamento como confirmado sem a autorização e o fluxo que vierem a ser definidos na fase financeira.

A distinção entre confirmação manual externa e confirmação automática por provedor deve permanecer preservada.

---

# 31. HISTÓRICO E AUDITORIA

Registrar eventos relevantes:

- criação;
- atribuição;
- transferência;
- mensagem;
- nota;
- mudança de status;
- encaminhamento;
- resposta da empresa;
- orçamento;
- agendamento;
- resolução;
- reabertura.

Preservar autoria e timestamps.

Não registrar segredos/tokens em auditoria.

Não duplicar conteúdo pessoal desnecessariamente.

---

# 32. REABERTURA

Definir comportamento seguro para atendimento resolvido quando cliente voltar a interagir.

Quando apropriado:

- reabrir ticket existente;

ou

- criar novo ticket relacionado ao histórico anterior.

Escolha a estratégia mais consistente com o modelo atual e documente.

Evitar tickets eternos acumulando assuntos diferentes.

---

# 33. SUSPENSÃO E REVOGAÇÃO

Testar rigorosamente:

- empresa suspensa;
- atendente suspenso;
- vínculo removido;
- membro removido;
- permissão alterada durante atendimento;
- sessão já aberta após revogação.

Revogação deve ser reavaliada no backend.

Um atendente que perdeu acesso não pode continuar operando apenas porque a página já estava aberta.

---

# 34. SEGURANÇA MULTIEMPRESA

Esta é uma área CRÍTICA.

Garantir que:

- atendente autorizado em A não acessa B;
- ticket A não recebe cliente B;
- mensagem A não aparece em B;
- nota A não aparece em B;
- orçamento A não pode ser associado a B;
- agenda A não pode ser operada por B;
- respostas rápidas não cruzam empresas;
- manual não cruza empresas;
- contexto não cruza empresas;
- pesquisa não revela dados de empresas sem vínculo;
- transferência não permite destinatário não autorizado;
- UUID conhecido não concede acesso.

Preservar RLS/FORCE RLS e validações server-side/database.

---

# 35. TESTES OBRIGATÓRIOS

Além da regressão completa das fases anteriores, testar pelo menos:

1. atendente autorizado acessa ticket da empresa correta;
2. atendente sem vínculo recebe acesso negado;
3. revogação durante sessão bloqueia nova operação;
4. Empresa A não acessa ticket de B;
5. consumidor não acessa nota interna;
6. resposta rápida de A não aparece em B;
7. manual privado/rascunho não aparece ao atendente quando não autorizado;
8. atendente não ultrapassa limite de desconto;
9. atendente não altera preço arbitrariamente;
10. duas pessoas tentando assumir mesmo ticket não conseguem dupla atribuição;
11. transferência simultânea não corrompe estado;
12. mensagem baseada em revisão antiga é tratada corretamente;
13. encaminhamento para empresa registra motivo/contexto;
14. resposta da empresa retorna ao fluxo correto;
15. orçamento criado pela Central preserva regras existentes;
16. agendamento criado pela Central preserva conflito/rollback;
17. empresa suspensa bloqueia operação;
18. atendente suspenso bloqueia operação;
19. busca não descobre dados não autorizados;
20. nota interna jamais aparece na projeção do consumidor;
21. histórico registra autoria;
22. resolução/reabertura funciona sem duplicação indevida;
23. estado de presença não concede autorização;
24. mudança de autonomia passa a valer em operação subsequente;
25. dados financeiros preparados não podem ser confirmados indevidamente;
26. nenhum segredo/token aparece no frontend/log/auditoria;
27. regressão completa das Fases 2, 3 e 4 continua aprovada.

Testar também interface em:

- desktop;
- tablet;
- mobile quando fizer sentido operacional.

A Central será prioritariamente desktop/tablet, mas deve continuar utilizável em telas menores para ações emergenciais.

---

# 36. EXPERIÊNCIA VISUAL

A Central deve parecer um produto profissional de operação.

Prioridades:

- alta densidade de informação sem confusão;
- empresa sempre identificável;
- cliente sempre identificável;
- status evidente;
- próxima ação evidente;
- tempo de espera visível;
- ações frequentes acessíveis;
- contexto sem excesso;
- diferenciação clara entre mensagem pública e nota interna.

Evitar dashboard cheio de gráficos desnecessários.

A tela principal deve ser construída para TRABALHAR, não apenas para impressionar visualmente.

---

# 37. PREPARAÇÃO PARA FASE 6

Organizar eventos e estados para que a próxima fase consiga implementar:

- follow-up;
- recuperação de orçamento;
- abandono;
- retorno programado;
- oportunidades;
- tentativas;
- próxima ação;
- tarefas comerciais.

NÃO implementar a automação comercial completa da Fase 6 agora.

Porém, evitar decisões arquiteturais que obriguem retrabalho nela.

---

# 38. NÃO IMPLEMENTAR NESTA FASE

Não implementar:

- IA;
- chatbot;
- WhatsApp Business API;
- telefonia;
- discador;
- gateway financeiro real;
- Pix/cartão real;
- campanhas;
- marketing automation completo;
- CRM complexo;
- financeiro completo;
- estoque;
- fiscal;
- ERP;
- folha/ponto eletrônico;
- aplicativo nativo;
- funcionalidades da Fase 6 completas;
- métricas avançadas da Fase 7;
- billing/assinaturas da Fase 8.

---

# 39. HOMOLOGAÇÃO EXTERNA

Prepare guia específico de homologação externa da Fase 5.

Deve contemplar, quando aplicável:

- Supabase real;
- RLS com JWT real;
- revogação durante sessão;
- multiempresa;
- múltiplos atendentes;
- concorrência;
- mensagens;
- atribuição;
- transferência;
- notas internas;
- manual;
- autonomia;
- orçamento;
- agenda;
- suspensão;
- auditoria.

Não declarar esses itens homologados externamente se forem testados apenas em PGlite, mocks, fixtures ou simuladores.

A homologação externa pode continuar pendente sem bloquear a próxima fase de DESENVOLVIMENTO, desde que documentada e posteriormente autorizada por Marcelo.

---

# 40. ENTREGA COMPLETA PERMANENTE

Mantenha a regra permanente:

Ao concluir a Fase 5, entregue o PROJETO COMPLETO E ATUALIZADO.

NÃO quero apenas os arquivos alterados nesta fase.

A entrega deverá conter TODOS os arquivos necessários para o projeto existir independentemente deste ambiente e desta conversa:

- todo código-fonte;
- páginas;
- componentes;
- estilos;
- assets;
- package.json;
- lockfile;
- TODAS as migrations desde a primeira;
- SQL;
- schemas;
- RLS;
- policies;
- funções;
- RPCs;
- scripts;
- testes;
- fixtures;
- configurações;
- `.env.example`;
- exemplos server-side quando necessários;
- README;
- AGENTS.md;
- documentação;
- inventário técnico;
- matriz de testes;
- relatórios;
- guia de instalação;
- guia de homologação;
- preparação de build;
- preparação para deploy futuro;
- qualquer outro arquivo necessário.

Nenhuma parte obrigatória pode existir somente no ambiente do agente ou nesta conversa.

A fonte da verdade deve ser o PROJETO ENTREGUE.

---

# 41. REGRESSÃO

Antes de encerrar:

- executar testes da Fase 5;
- executar regressão das Fases anteriores;
- executar typecheck;
- executar build;
- verificar bundle por segredos;
- verificar migrations;
- verificar RLS/policies/grants;
- verificar isolamento;
- inspecionar visualmente as principais telas;
- documentar falhas encontradas e respectivas correções.

Não esconder teste que falhou.

Se algo não puder ser validado localmente, classificar corretamente como PENDENTE DE HOMOLOGAÇÃO EXTERNA.

---

# 42. ENCERRAMENTO DA FASE

Ao terminar, entregar:

1. relatório completo da Fase 5;
2. inventário técnico;
3. resultados dos testes;
4. falhas encontradas e correções;
5. limitações conhecidas;
6. pendências externas;
7. guia de homologação externa;
8. projeto completo atualizado.

Diferenciar claramente:

DESENVOLVIMENTO LOCAL = implementado/testado;

HOMOLOGAÇÃO EXTERNA = pendente quando depender de infraestrutura real;

PRODUÇÃO/LANÇAMENTO = exclusivamente responsabilidade de Marcelo.

NÃO faça deploy.

NÃO publique.

NÃO utilize clientes reais.

NÃO processe pagamentos reais.

NÃO contrate ou ative serviços pagos.

NÃO inicie a Fase 6.

Ao concluir a Fase 5, PARE e aguarde minha aprovação.