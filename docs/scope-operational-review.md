O desenvolvimento das Fases 2–8 e do complemento de trial está concluído.

Esta solicitação é uma **REVISÃO FINAL PRÉ-HOMOLOGAÇÃO** baseada no uso real do produto por Marcelo.

**NÃO criar Fase 9.**

**NÃO publicar.**

**NÃO conectar Supabase real.**

**NÃO contratar serviços externos.**

**NÃO utilizar dados reais.**

O objetivo é corrigir lacunas importantes encontradas na experiência cotidiana da empresa antes da homologação externa.

O projeto entregue continua sendo cumulativo das Fases 2–8.

---

## 1. PRINCÍPIO DESTA REVISÃO

A plataforma possui muitas funcionalidades tecnicamente completas, porém a revisão prática revelou que algumas foram organizadas pela estrutura interna do produto, e não suficientemente pelas tarefas cotidianas do prestador.

A partir desta revisão, adotar como princípio:

**A empresa não deve precisar conhecer a arquitetura interna da plataforma para conseguir trabalhar.**

A interface deve responder prioritariamente:

**“O que eu preciso fazer hoje?”**

**“Quem eu vou atender?”**

**“O que foi contratado?”**

**“Existe alguma coisa esperando minha decisão?”**

**“Como executo e concluo este serviço?”**

**“O que tenho amanhã?”**

**“Como está meu negócio?”**

Não remover funcionalidades gerenciais já existentes.

Organizar melhor operação cotidiana, gestão e análise.

---

# 2. HOME OPERACIONAL DA EMPRESA

Revisar profundamente a primeira página apresentada ao gestor/prestador após entrar em uma empresa.

Ela NÃO deve ser apenas um dashboard genérico.

Deve funcionar como **central diária de trabalho da empresa**.

O primeiro conteúdo relevante deve responder:

**O QUE PRECISA SER FEITO HOJE?**

Apresentar, conforme dados existentes:

-  data atual; 
-  quantidade de serviços/agendamentos de hoje; 
-  próximo atendimento; 
-  agendamentos aguardando confirmação; 
-  serviços em andamento; 
-  pendências que exigem decisão da empresa; 
-  solicitações de autorização vindas do atendimento; 
-  pedidos de reagendamento; 
-  orçamentos que exigem ação da empresa; 
-  outras tarefas operacionais realmente acionáveis. 

Criar bloco destacado:

**AGENDA DE HOJE**

Exibir horário, cliente, serviço e estado.

Cada item deve abrir diretamente sua ficha operacional.

Criar também:

**PRECISA DA SUA ATENÇÃO**

Cada pendência deve informar claramente o problema e possuir ação direta para resolvê-lo.

Não mostrar apenas “3 pendências” obrigando o usuário a procurar onde elas estão.

Criar uma pequena visão:

**AMANHÃ**

mostrando próximos agendamentos e acesso à Agenda completa.

---

# 3. AÇÕES RÁPIDAS

Disponibilizar na Home ações frequentes, especialmente:

**+ Novo agendamento**

**+ Novo cliente**

e, se coerente com os fluxos existentes:

**+ Novo orçamento**

Não duplicar entidades ou criar fluxos paralelos.

Reutilizar customers, requests/opportunities, quotes e appointments existentes.

---

# 4. AGENDA OPERACIONAL COMPLETA

Criar uma área principal e evidente chamada **Agenda**.

Ela deve ser uma ferramenta cotidiana do prestador.

Disponibilizar visualizações adequadas:

**Hoje**

**Dia**

**Semana**

**Calendário**

O usuário deve conseguir identificar rapidamente:

-  horários; 
-  clientes; 
-  serviços; 
-  duração; 
-  situação; 
-  disponibilidade; 
-  bloqueios. 

A experiência deve funcionar especialmente bem em celular.

Não criar segundo sistema de agenda.

Auditar e reutilizar o modelo `appointments`, disponibilidade, recursos e prevenção de conflitos já existente.

---

# 5. AGENDAMENTO MANUAL

A empresa deve poder criar um agendamento diretamente.

Isso é necessário porque nem todo cliente chegará pela página pública.

Exemplos:

-  WhatsApp; 
-  telefone; 
-  presencial; 
-  indicação; 
-  cliente recorrente. 

Permitir selecionar cliente existente ou criar cliente dentro do fluxo, respeitando regras de dados e consentimento aplicáveis.

Selecionar:

-  serviço; 
-  adicionais quando aplicáveis; 
-  data; 
-  horário; 
-  duração; 
-  observações necessárias. 

Registrar origem corretamente.

Um agendamento manual deve utilizar as mesmas regras server-side de disponibilidade e conflito dos agendamentos originados pelo consumidor.

---

# 6. BLOQUEIOS DE AGENDA

Permitir à empresa bloquear períodos em que não deseja receber agendamentos.

Exemplos:

-  almoço; 
-  compromisso; 
-  manutenção; 
-  folga; 
-  feriado; 
-  viagem; 
-  período reservado. 

Bloqueio deve participar da mesma proteção de disponibilidade utilizada pelos agendamentos.

Não permitir conflito silencioso entre bloqueio e reserva.

Permitir visualizar claramente os bloqueios na Agenda.

Não criar sistema complexo de escala de funcionários nesta revisão.

---

# 7. FICHA OPERACIONAL DO SERVIÇO

Ao abrir um agendamento, o prestador deve encontrar em uma única visão tudo que precisa para executar aquele serviço.

Consolidar, quando existentes e autorizados:

-  cliente; 
-  contato; 
-  serviço; 
-  adicionais; 
-  data/horário; 
-  duração; 
-  orçamento relacionado; 
-  versão aprovada; 
-  valor aprovado; 
-  respostas fornecidas pelo consumidor; 
-  observações; 
-  origem; 
-  histórico relevante; 
-  situação atual. 

Não obrigar o prestador a navegar por diversas páginas para descobrir o que foi contratado.

Não duplicar dados desnecessariamente; utilizar referências às entidades existentes.

---

# 8. EXECUÇÃO DO SERVIÇO

Formalizar o ciclo operacional do agendamento.

Auditar primeiro os estados já existentes e ampliar somente onde necessário.

A experiência deve permitir representar claramente:

**Agendado**

**Confirmado**, quando aplicável

**Em execução**

**Concluído**

além de:

**Reagendado**

**Cancelado**

Não criar estados contraditórios ou duplicados.

A ficha deve possuir ações coerentes, por exemplo:

**Confirmar**

**Iniciar serviço**

**Finalizar serviço**

**Reagendar**

**Cancelar**

Todas as transições devem ser:

-  autorizadas server-side; 
-  auditáveis; 
-  consistentes; 
-  idempotentes quando aplicável; 
-  protegidas contra revisão obsoleta/concorrência. 

Finalizar serviço deve gerar um fato operacional real e refletir corretamente no histórico e nas métricas correspondentes.

**Serviço concluído NÃO significa automaticamente pagamento recebido ou receita.**

Não fabricar informação financeira.

---

# 9. REAGENDAMENTO

Criar fluxo claro para reagendamento pela empresa.

Preservar histórico do horário anterior.

Verificar novamente disponibilidade e conflito antes de confirmar novo horário.

Se existir solicitação de reagendamento originada pelo consumidor/atendimento, ela deve aparecer de maneira acionável para a empresa.

---

# 10. NAVEGAÇÃO DA EMPRESA

Revisar a arquitetura de informação do painel empresarial.

Priorizar tarefas reais.

Uma estrutura possível é:

**Início**

**Agenda**

**Clientes**

**Orçamentos**

**Comercial**

**Atendimento**

**Métricas**

**Configurações**

Não seguir esta lista cegamente caso a auditoria do projeto indique agrupamento melhor.

Entretanto:

**Home deve servir para trabalhar.**

**Agenda deve servir para organizar/executar.**

**Métricas devem servir para analisar.**

**Configurações devem concentrar atividades não cotidianas.**

Evitar menu excessivamente técnico ou fragmentado.

---

# 11. MÉTRICAS DA EMPRESA

PRESERVAR as métricas gerenciais da própria empresa.

Elas continuam sendo parte importante do produto.

Gestores autorizados devem poder analisar:

-  solicitações; 
-  oportunidades; 
-  propostas/orçamentos; 
-  aprovações; 
-  agendamentos; 
-  conclusões, após esta revisão; 
-  conversões; 
-  perdas; 
-  origens; 
-  serviços; 
-  evolução temporal; 
-  acompanhamento comercial; 
-  demais indicadores legítimos existentes. 

Manter distinções existentes entre valor orçado, aprovado, conversão e receita.

Não inventar receita.

---

# 12. PRIVACIDADE DAS MÉTRICAS

Revisar profundamente autorização das métricas.

**Métricas comerciais e operacionais privadas pertencem à empresa.**

O papel global `super_admin` NÃO deve, apenas por ser superadmin, poder navegar livremente pelas métricas comerciais privadas individuais de cada empresa.

Superadmin deve visualizar somente informações necessárias para administrar o SaaS, como:

-  empresas; 
-  status operacional; 
-  planos; 
-  assinaturas; 
-  trials; 
-  utilização necessária à aplicação de limites; 
-  capacidade da plataforma; 
-  indicadores agregados legítimos da plataforma. 

Não expor ao superadmin, sem fundamento operacional específico:

-  desempenho comercial individual; 
-  serviços mais vendidos de determinada empresa; 
-  funil privado; 
-  clientes; 
-  valores comerciais; 
-  informações estratégicas internas. 

A restrição deve existir **no servidor/RPC/RLS/autorização**, e não apenas escondendo componentes no frontend.

---

# 13. ATENDENTE COMPARTILHADO DA PLATAFORMA

Os atendentes compartilhados pertencentes à operação do SaaS devem acessar somente as empresas às quais possuem vínculo operacional válido.

Eles devem visualizar somente informações necessárias ao atendimento:

-  consumidor relacionado; 
-  conversa; 
-  serviço relacionado; 
-  solicitação; 
-  orçamento necessário; 
-  agendamento necessário; 
-  manual publicado; 
-  FAQ; 
-  regras; 
-  autonomia; 
-  contexto operacional explicitamente compartilhado. 

**Não permitir acesso às métricas gerenciais/comerciais da empresa.**

O fato de atender uma empresa não concede acesso administrativo a ela.

---

# 14. ATENDENTE PRÓPRIO DA EMPRESA

Auditar os papéis empresariais atuais e formalizar, caso ainda não exista de maneira adequada, o conceito de:

**ATENDENTE PRÓPRIO DA EMPRESA**

É um usuário cadastrado/vinculado pela própria empresa para trabalhar no atendimento dos consumidores daquela organização.

Ele pode utilizar a experiência operacional da Central para aquela empresa.

Por padrão NÃO recebe métricas gerenciais.

Não deve receber poderes administrativos simplesmente por ser atendente.

A empresa deve conseguir gerenciar seus usuários e identificar claramente:

-  gestores/administradores; 
-  colaboradores autorizados; 
-  atendentes próprios. 

Não hardcodar pessoas específicas.

---

# 15. MODELOS DE ATENDIMENTO

A arquitetura deve permitir:

**Atendimento próprio**

A empresa utiliza apenas sua equipe.

**Atendimento compartilhado**

A empresa utiliza atendentes da plataforma vinculados.

**Atendimento misto**

Equipe própria e equipe compartilhada podem atuar, respeitando vínculos, responsabilidade, fila, transferência, autorização e auditoria.

Não criar conflito de responsabilidade entre dois atendentes.

Reutilizar mecanismos de responsabilidade única, transferência, revisão e idempotência existentes na Central.

---

# 16. MANUAL E ATENDIMENTO HUMANO

Preservar o conceito:

**Sabe + está no manual + possui autonomia → resolve.**

**Sabe, mas não possui autonomia → solicita autorização.**

**Não sabe/manual não responde → não inventa → consulta a empresa.**

Quando a empresa utilizar atendimento humano compartilhado, tornar evidente durante configuração/onboarding que deve preparar:

-  manual; 
-  FAQ; 
-  regras; 
-  autonomia; 
-  informações necessárias à equipe. 

Comunicar de maneira simples:

**“Você define como sua empresa atende. Nossa equipe segue suas orientações.”**

Não transformar isso em burocracia desnecessária.

---

# 17. PENDÊNCIAS E AUTORIZAÇÕES

Pendências da empresa precisam ser realmente acionáveis.

Quando um atendente solicitar decisão, o gestor deve conseguir:

-  entender o contexto; 
-  saber qual cliente/atendimento está relacionado; 
-  ver o que precisa decidir; 
-  responder; 
-  retornar automaticamente o fluxo para quem estava atendendo. 

Pendências importantes devem aparecer também na Home Operacional.

Evitar pendências órfãs ou que dependam de procura manual.

---

# 18. NOTIFICAÇÕES INTERNAS ESSENCIAIS

Auditar o sistema de `notifications` já existente.

Sem adicionar integração externa paga nesta revisão, garantir notificações internas úteis para eventos como:

-  novo agendamento; 
-  reagendamento; 
-  cancelamento; 
-  decisão solicitada; 
-  mudança importante relacionada ao serviço; 
-  tarefa operacional relevante. 

Evitar excesso de notificações.

Notificação deve levar diretamente ao objeto relacionado.

---

# 19. AUDITORIA COMPLETA DA JORNADA DO PRESTADOR

Não considerar esta revisão concluída apenas porque as novas telas funcionam.

Executar uma auditoria de usabilidade baseada em tarefas reais.

Simular pelo menos:

1.  “Abri a empresa pela manhã. O que tenho hoje?” 
2.  “Quem é meu próximo cliente?” 
3.  “O que esse cliente contratou?” 
4.  “O cliente chegou. Como inicio o serviço?” 
5.  “Terminei o serviço. Como concluo?” 
6.  “O cliente pediu para mudar o horário.” 
7.  “Recebi agendamento pelo WhatsApp. Como registro?” 
8.  “Preciso bloquear amanhã das 12h às 14h.” 
9.  “Meu atendente precisa de autorização.” 
10.  “Quero saber o que tenho amanhã.” 
11.  “Quero consultar minha semana.” 
12.  “Quero saber como está meu negócio.” 
13.  “Quero cadastrar um funcionário para atender clientes sem permitir métricas.” 
14.  “Contratei atendimento compartilhado. Como preparo minha empresa?” 
15.  “Uso meus funcionários e a equipe compartilhada simultaneamente.” 

Para cada jornada, documentar:

-  ponto inicial; 
-  passos necessários; 
-  telas utilizadas; 
-  resultado; 
-  eventuais fricções encontradas; 
-  correções realizadas. 

Criar:

`docs/company-daily-journey-matrix.md`

O objetivo não é perseguir um número artificial de cliques, mas eliminar navegação desnecessária.

---

# 20. AUDITORIA DE UX DO PRODUTO EMPRESARIAL

Revisar ainda:

-  estados vazios; 
-  carregamento; 
-  erros; 
-  títulos; 
-  nomenclaturas; 
-  breadcrumbs; 
-  ações primárias; 
-  menus; 
-  responsividade; 
-  acessibilidade básica; 
-  clareza dos estados; 
-  feedback após ações; 
-  consistência visual. 

Um empresário sem conhecimento técnico deve entender a plataforma.

Evitar termos internos de banco/arquitetura na interface.

---

# 21. MOBILE FIRST PARA OPERAÇÃO

Home, Agenda e ficha operacional devem receber atenção especial em celular.

O prestador pode utilizar o sistema durante o serviço.

Garantir:

-  botões confortáveis; 
-  horários legíveis; 
-  ações importantes facilmente alcançáveis; 
-  ausência de tabelas impossíveis de utilizar; 
-  calendário responsivo; 
-  ficha operacional clara; 
-  confirmação antes de ações destrutivas. 

---

# 22. SEGURANÇA E ISOLAMENTO

Preservar e reforçar:

-  multitenancy; 
-  RLS/FORCE RLS; 
-  autorização server-side; 
-  revogação; 
-  suspensão; 
-  isolamento A/B; 
-  auditoria; 
-  idempotência; 
-  revisão esperada; 
-  proteção contra manipulação frontend; 
-  segregação entre gestor, atendente próprio, atendente compartilhado e superadmin. 

Não relaxar nenhuma proteção existente para facilitar UI ou testes.

---

# 23. TESTES OBRIGATÓRIOS

Adicionar testes específicos para:

-  Home de hoje; 
-  próximo atendimento; 
-  pendências; 
-  agendamento manual; 
-  bloqueio de agenda; 
-  conflito entre bloqueio e agendamento; 
-  conflito entre agendamentos; 
-  abertura da ficha; 
-  início do serviço; 
-  conclusão; 
-  conclusão repetida/idempotência; 
-  cancelamento; 
-  reagendamento; 
-  histórico do reagendamento; 
-  tentativa de transição inválida; 
-  concorrência preparada quando ambiente local não permitir teste nativo; 
-  integração com histórico; 
-  integração com métricas; 
-  notificações internas; 
-  empresa A/B; 
-  gestor acessando métricas próprias; 
-  gestor A tentando métricas B; 
-  superadmin tentando métricas privadas de uma empresa; 
-  atendente compartilhado tentando métricas; 
-  atendente próprio tentando métricas; 
-  atendente próprio usando Central autorizada; 
-  atendente próprio tentando outra empresa; 
-  modelo misto; 
-  revogação de atendente; 
-  responsividade mobile. 

Executar regressão cumulativa necessária das Fases 2–8 e trial.

---

# 24. DEMONSTRAÇÃO

Atualizar a empresa fictícia oficial para demonstrar:

-  dia com vários agendamentos; 
-  amanhã; 
-  bloqueio; 
-  serviço em andamento; 
-  serviço concluído; 
-  reagendamento; 
-  pendência; 
-  atendente próprio; 
-  atendente compartilhado; 
-  métricas da empresa; 
-  ausência dessas métricas para atendentes; 
-  ausência das métricas privadas individuais para superadmin. 

Manter exclusivamente dados fictícios.

Produzir evidências visuais desktop e mobile.

---

# 25. NÃO ADICIONAR NESTA REVISÃO

Não adicionar:

-  ERP; 
-  estoque; 
-  folha/ponto; 
-  emissão fiscal; 
-  contabilidade; 
-  caixa financeiro complexo; 
-  roteirização; 
-  aplicativo nativo; 
-  WhatsApp Business API; 
-  IA; 
-  gateway real; 
-  cobrança real; 
-  integrações pagas; 
-  funcionalidades sem relação direta com as lacunas encontradas. 

---

# 26. ENTREGA

Atualizar novamente:

**`Projeto-Fase-8-Final.zip`**

Ele deve continuar sendo o **projeto cumulativo completo**, e não um patch.

Incluir:

-  todo código-fonte; 
-  todas as migrations anteriores e novas; 
-  SQL/RPC/RLS; 
-  testes; 
-  fixtures; 
-  demo; 
-  assets; 
-  configuração; 
-  package.json; 
-  lockfile; 
-  documentação; 
-  matriz de jornadas; 
-  inventários; 
-  evidências; 
-  README; 
-  AGENTS; 
-  guia atualizado de homologação externa; 
-  MANIFEST. 

Entregar também:

**`Relatorio-Revisao-Operacional-Pre-Homologacao.md`**

explicando:

-  problemas encontrados; 
-  decisões adotadas; 
-  alterações; 
-  migrations; 
-  permissões; 
-  testes; 
-  resultados; 
-  limitações; 
-  pendências externas. 

---

# 27. PARADA OBRIGATÓRIA

Ao concluir:

**PARAR.**

Não publicar.

Não criar projeto Supabase.

Não iniciar homologação externa.

Não criar Fase 9.

Não fazer alterações adicionais não autorizadas.

A próxima etapa continuará se chamando:

**HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO**

e dependerá de autorização expressa de Marcelo.