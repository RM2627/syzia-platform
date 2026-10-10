**FASE 8 — FINALIZAÇÃO DO PRODUTO**

A **Fase 7 está aprovada para continuidade do desenvolvimento**.

Inicie agora a **Fase 8, última fase prevista do desenvolvimento do produto**.

Continue obrigatoriamente a partir da entrega cumulativa atual, preservando toda a arquitetura, banco, migrations, RLS/FORCE RLS, autorização, regras de negócio, testes, histórico, funcionalidades e decisões implementadas nas Fases 2–7.

A Fase 7 implementou Analytics e também melhorou significativamente a apresentação da aplicação. A página pública finalmente passou a apresentar estrutura comercial com hero, identidade da empresa, catálogo, portfólio e informações comerciais.

Entretanto, após avaliação visual da aplicação executada localmente, considero que **o produto ainda precisa de uma última evolução de UI/UX para atingir o nível visual esperado de um SaaS comercial profissional**.

Portanto, a Fase 8 possui dois objetivos igualmente obrigatórios:

**1. concluir o escopo funcional restante do produto;**

**2. realizar o acabamento final de produto/UI/UX das Fases 2–8.**

Não reconstruir desnecessariamente o que já funciona.

---

# 1. OBJETIVO FINAL DO PRODUTO

Ao final desta fase, a plataforma deve constituir um produto SaaS coerente e completo para pequenas empresas prestadoras de serviços.

A proposta central continua sendo:

**Página profissional própria + catálogo/serviços + portfólio + orçamento + aprovação + agendamento + acompanhamento do cliente + gestão da empresa + atendimento humano compartilhado + operação comercial/follow-up + métricas + planos/assinatura.**

O consumidor deve conseguir resolver sozinho grande parte da jornada.

Quando precisar de ajuda, deve conseguir chegar ao atendimento humano.

A empresa deve conseguir administrar sua operação.

O atendente compartilhado deve possuir Central própria.

O comercial deve conseguir acompanhar oportunidades e follow-ups.

A administração da plataforma deve conseguir administrar empresas, operação, planos e assinaturas de acordo com as permissões previstas.

Não transformar o produto em ERP genérico.

---

# 2. ACABAMENTO VISUAL FINAL — REQUISITO OBRIGATÓRIO

A interface atual melhorou, porém **ainda não considero o acabamento visual definitivo**.

Executar nesta fase uma revisão profissional completa de UI/UX.

O resultado final não deve transmitir aparência de:

-  protótipo; 
-  projeto acadêmico; 
-  painel administrativo genérico; 
-  template pouco personalizado; 
-  coleção de componentes independentes; 
-  demonstração técnica. 

Deve transmitir aparência de **produto SaaS comercial pronto para ser apresentado a empresas**.

Isso não significa utilizar efeitos visuais excessivos.

Priorizar:

-  hierarquia; 
-  consistência; 
-  legibilidade; 
-  densidade adequada; 
-  aproveitamento do espaço; 
-  tipografia; 
-  composição; 
-  identidade; 
-  responsividade; 
-  feedback; 
-  acessibilidade; 
-  produtividade. 

---

# 3. PÁGINA PÚBLICA DA EMPRESA

A página pública deve receber atenção especial.

Ela não é apenas uma página funcional da plataforma.

Para o consumidor, ela deve funcionar como a **presença digital profissional daquela empresa**.

Preservar e evoluir o que foi implementado na Fase 7.

A página deve utilizar adequadamente, quando configurados:

-  logo; 
-  capa/banner/fotografia; 
-  nome; 
-  descrição; 
-  identidade visual; 
-  localização/região atendida; 
-  informações comerciais; 
-  categorias; 
-  serviços; 
-  imagens dos serviços; 
-  preços; 
-  preço “a partir de”; 
-  “sob consulta”; 
-  duração; 
-  adicionais; 
-  portfólio; 
-  antes/depois; 
-  horários; 
-  formas de pagamento; 
-  FAQ; 
-  políticas; 
-  orçamento; 
-  agendamento; 
-  acompanhamento; 
-  atendimento humano. 

Melhorar especialmente:

-  hero; 
-  navegação; 
-  composição; 
-  espaçamento; 
-  tipografia; 
-  cards; 
-  CTAs; 
-  seções; 
-  portfólio; 
-  apresentação das informações; 
-  rodapé; 
-  estados de carregamento; 
-  estados vazios; 
-  erros; 
-  mobile. 

Evitar espaços vazios excessivos ou seções que pareçam incompletas.

---

# 4. PERSONALIZAÇÃO DAS EMPRESAS

Empresas diferentes não devem parecer apenas cópias do mesmo site com outra cor.

Sem construir um page builder complexo, permitir que os recursos já previstos gerem identidade suficientemente distinta através de:

-  cores; 
-  logo; 
-  capa; 
-  fotografias; 
-  conteúdo; 
-  serviços; 
-  categorias; 
-  portfólio; 
-  ordem/configuração das seções quando já suportado; 
-  informações comerciais. 

Utilizar as empresas fictícias da demo para demonstrar claramente essa diferença.

Ao visualizar duas empresas diferentes, deve ser evidente que pertencem à mesma plataforma, mas também que possuem **identidades próprias**.

---

# 5. SERVIÇOS

Refinar a apresentação do catálogo.

Cards devem suportar profissionalmente:

-  fotografia; 
-  categoria; 
-  nome; 
-  descrição; 
-  duração; 
-  preço; 
-  a partir de; 
-  sob consulta; 
-  adicionais; 
-  orçamento; 
-  agendamento quando aplicável. 

Criar fallback visual profissional para serviços sem fotografia.

Não depender de ilustrações fictícias para que o layout pareça completo.

---

# 6. PORTFÓLIO

O portfólio deve funcionar como prova visual do trabalho da empresa.

Evoluir sua experiência para fotografias reais.

Suportar adequadamente:

-  galeria; 
-  antes/depois; 
-  imagens individuais; 
-  descrição; 
-  relação com serviço/categoria quando existente; 
-  visualização ampliada/lightbox quando apropriado; 
-  navegação touch/mobile. 

Não limitar o design ao formato das ilustrações utilizadas na fixture atual.

---

# 7. ÁREAS INTERNAS

Aplicar acabamento profissional também a todas as áreas autenticadas.

Revisar:

-  autenticação; 
-  onboarding; 
-  painel da empresa; 
-  configurações; 
-  serviços; 
-  adicionais; 
-  portfólio; 
-  clientes; 
-  orçamentos; 
-  agenda; 
-  acompanhamento; 
-  manual; 
-  autonomia; 
-  pendências; 
-  Central; 
-  Comercial; 
-  Analytics; 
-  administração da plataforma; 
-  planos; 
-  assinatura; 
-  cobrança. 

Consolidar definitivamente o design system.

Revisar:

-  sidebar; 
-  navbar; 
-  breadcrumbs; 
-  cards; 
-  tabelas; 
-  listas; 
-  gráficos; 
-  formulários; 
-  filtros; 
-  modais; 
-  drawers; 
-  tabs; 
-  badges; 
-  status; 
-  tooltips; 
-  skeletons; 
-  loading; 
-  empty states; 
-  mensagens de erro; 
-  confirmações; 
-  notificações. 

Central e Comercial são ferramentas operacionais: não sacrificar velocidade de trabalho por estética.

---

# 8. RESPONSIVIDADE

Executar revisão real para:

-  desktop; 
-  notebook; 
-  tablet; 
-  smartphone. 

A página pública deve possuir prioridade mobile.

Não simplesmente reduzir a interface desktop.

Revisar especialmente no celular:

-  menu; 
-  hero; 
-  serviços; 
-  portfólio; 
-  formulários; 
-  orçamento; 
-  agenda; 
-  acompanhamento; 
-  atendimento. 

Testar também:

-  textos longos; 
-  nomes longos; 
-  preços; 
-  fotografias em proporções diferentes; 
-  listas grandes; 
-  estados vazios; 
-  erro; 
-  loading; 
-  conexão lenta. 

---

# 9. FASE 8 — PLANOS

Implementar a estrutura definitiva de planos da plataforma.

A arquitetura deve permitir diferentes ofertas comerciais sem hardcode desnecessário.

Preparar suporte para modelos como:

**software somente**

e

**software + atendimento humano compartilhado**

sem hardcode de Marcelo, Ranna ou qualquer pessoa específica.

Planos devem poder possuir:

-  nome; 
-  descrição; 
-  preço; 
-  periodicidade; 
-  recursos; 
-  limites; 
-  status; 
-  disponibilidade; 
-  ordem de apresentação; 
-  regras necessárias. 

Preços e nomes utilizados na demo devem permanecer configuráveis e fictícios enquanto não forem definidos comercialmente.

---

# 10. ASSINATURAS

Implementar gestão de assinatura da empresa.

Considerar estados e operações coerentes como:

-  trial, se configurado; 
-  ativa; 
-  pendente; 
-  vencida; 
-  inadimplente quando aplicável; 
-  cancelada; 
-  suspensa quando aplicável; 
-  upgrade; 
-  downgrade; 
-  cancelamento; 
-  reativação; 
-  renovação. 

A empresa deve conseguir visualizar adequadamente:

-  plano atual; 
-  recursos; 
-  limites; 
-  utilização; 
-  situação da assinatura; 
-  histórico pertinente; 
-  ações permitidas. 

A administração da plataforma deve possuir visão adequada para administrar esse domínio conforme permissões.

---

# 11. LIMITES E USO

Implementar medição segura dos recursos necessários aos planos.

Quando pertinente, considerar unidades como:

-  membros; 
-  serviços; 
-  solicitações; 
-  atendimentos; 
-  oportunidades; 
-  follow-ups; 
-  recursos da plataforma; 
-  demais unidades realmente necessárias. 

Não inventar métricas apenas para justificar planos.

Limites críticos devem ser validados server-side.

Nunca depender exclusivamente de esconder um botão no frontend.

Prever comportamento claro quando um limite for atingido.

---

# 12. BILLING / COBRANÇA

Implementar a arquitetura necessária de billing, mas **NÃO integrar cobrança real nesta etapa**.

Continuamos sem homologação externa.

Portanto:

-  não contratar gateway; 
-  não inserir credenciais reais; 
-  não cobrar cartão; 
-  não gerar cobrança real; 
-  não utilizar conta bancária real; 
-  não utilizar cliente real. 

Criar uma abstração adequada de provedor de pagamento para permitir integração posterior.

Para desenvolvimento e demo, utilizar exclusivamente implementação/mock fictício claramente identificado.

Preparar corretamente conceitos como:

-  cobrança criada; 
-  pendente; 
-  paga; 
-  falhou; 
-  vencida; 
-  cancelada; 
-  reembolsada quando aplicável; 
-  renovação; 
-  alteração de plano. 

Preparar arquitetura segura para futuros webhooks:

-  validação/autenticação; 
-  idempotência; 
-  repetição; 
-  auditoria; 
-  concorrência. 

Credenciais futuras nunca poderão ficar expostas no frontend.

---

# 13. DUAS RELAÇÕES FINANCEIRAS DIFERENTES

Manter separação absoluta entre:

### PAGAMENTO DA EMPRESA PARA A PLATAFORMA

Assinatura do SaaS.

e

### PAGAMENTO DO CONSUMIDOR PARA A EMPRESA

Pagamento pelo serviço contratado.

São domínios diferentes.

Não misturar:

-  receita da plataforma; 
-  faturamento da empresa; 
-  valor orçado; 
-  valor aprovado; 
-  valor recebido. 

Se pagamento do consumidor continuar apenas preparado e não integrado nesta fase, documentar claramente.

---

# 14. ADMINISTRAÇÃO DA PLATAFORMA

Garantir que a área administrativa final permita administrar adequadamente o SaaS dentro do escopo implementado.

Revisar e integrar as funções administrativas existentes e as novas da Fase 8.

A administração deve conseguir, conforme autorização:

-  visualizar empresas; 
-  visualizar situação operacional pertinente; 
-  administrar planos; 
-  acompanhar assinaturas; 
-  visualizar uso; 
-  acessar métricas da plataforma; 
-  lidar com estados administrativos necessários; 
-  consultar informações necessárias para suporte da plataforma. 

Não transformar essa área em acesso irrestrito aos dados privados das empresas.

Continuar respeitando isolamento, finalidade e autorização.

A área administrativa também precisa receber **acabamento visual profissional**.

---

# 15. ANALYTICS + ASSINATURAS

Integrar as informações da Fase 8 ao Analytics somente quando existirem dados verdadeiros.

Não fabricar:

-  MRR; 
-  ARR; 
-  receita; 
-  churn; 
-  LTV; 
-  pagamentos; 
-  crescimento financeiro. 

Se não existe pagamento real, não apresentar receita real.

Na demo, dados fictícios precisam estar claramente restritos ao ambiente fictício.

---

# 16. DEMO FINAL

A empresa fictícia oficial deve se tornar a demonstração completa do produto.

A demo precisa permitir percorrer:

**PÁGINA PÚBLICA**

→ serviço

→ portfólio

→ solicitação

→ orçamento

→ aprovação

→ agendamento

→ acompanhamento

→ atendimento humano

→ Comercial

→ follow-up

→ conversão

→ Analytics.

Adicionar também cenários fictícios suficientes para demonstrar:

-  planos; 
-  assinatura; 
-  uso; 
-  administração da plataforma. 

Preservar reset da demo.

Nunca utilizar informações reais da MS Auto Details.

---

# 17. REVISÃO DE INTEGRAÇÃO DO PRODUTO COMPLETO

Como esta é a última fase, executar uma auditoria completa das Fases 2–8.

Procurar e corrigir:

-  rotas quebradas; 
-  botões sem função; 
-  telas inacessíveis; 
-  páginas órfãs; 
-  links incorretos; 
-  terminologia inconsistente; 
-  componentes duplicados; 
-  estilos antigos; 
-  interfaces ainda com aparência de protótipo; 
-  estados impossíveis; 
-  dados fictícios fora da demo; 
-  mocks indevidos; 
-  erros silenciosos; 
-  TODOs críticos; 
-  funcionalidades implementadas mas inacessíveis; 
-  inconsistências de autorização; 
-  inconsistências entre frontend e banco; 
-  regressões. 

O resultado deve parecer **um produto único**, e não oito fases juntadas.

---

# 18. PERFORMANCE

Revisar performance razoavelmente antes do encerramento.

A Fase 7 reportou aviso de bundle principal de aproximadamente 504 kB.

Avaliar oportunidades seguras de:

-  lazy loading; 
-  code splitting; 
-  separação de módulos; 
-  carregamento sob demanda. 

Dar atenção especial à página pública.

Um consumidor que abre a página de uma empresa não deve precisar baixar desnecessariamente código da:

-  Central; 
-  Comercial; 
-  Analytics; 
-  administração; 
-  billing. 

Não fazer reescrita desnecessária apenas para otimização.

Medições definitivas de infraestrutura continuam para homologação externa.

---

# 19. SEGURANÇA

Preservar integralmente tudo que já foi construído:

-  multi-tenancy; 
-  RLS/FORCE RLS; 
-  autorização; 
-  isolamento A/B; 
-  revogação; 
-  suspensão; 
-  auditoria; 
-  consumidor seguro; 
-  links seguros; 
-  Storage; 
-  idempotência; 
-  concorrência; 
-  histórico; 
-  Central; 
-  Comercial; 
-  Analytics. 

Adicionar cobertura específica para:

-  planos; 
-  assinatura; 
-  limites; 
-  uso; 
-  billing; 
-  transições; 
-  permissões administrativas; 
-  tentativa de manipulação pelo frontend; 
-  isolamento entre organizações; 
-  repetição/idempotência; 
-  revogação. 

Nunca enfraquecer RLS ou autorização para facilitar a Fase 8.

---

# 20. TESTES FINAIS

Executar novamente regressão completa das Fases 2–8.

Além dos testes automatizados, realizar testes da demo através do fluxo real da aplicação.

Produzir evidências visuais atualizadas das principais telas.

Incluir desktop e mobile.

A entrega deve informar claramente:

-  quantidade de testes; 
-  aprovados; 
-  falhas; 
-  testes não executados; 
-  limitações; 
-  ambiente utilizado; 
-  o que depende de homologação externa. 

Não considerar mock/PGlite equivalente a Supabase real.

---

# 21. FORA DO ESCOPO

Mesmo sendo a última fase, **não aumentar indiscriminadamente o produto**.

Continuam fora do escopo, salvo preparação já prevista:

-  IA/chatbot; 
-  WhatsApp Business API; 
-  ERP completo; 
-  estoque complexo; 
-  emissão fiscal; 
-  contabilidade; 
-  folha; 
-  aplicativo nativo; 
-  campanhas de marketing em massa; 
-  page builder avançado; 
-  funcionalidades sem relação com o produto planejado. 

---

# 22. NÃO REALIZAR HOMOLOGAÇÃO EXTERNA AGORA

A decisão permanece inalterada.

**NÃO:**

-  conectar Supabase real; 
-  publicar; 
-  fazer deploy de produção; 
-  utilizar domínio de produção; 
-  utilizar clientes reais; 
-  utilizar dados reais da MS; 
-  contratar serviços pagos; 
-  processar pagamentos reais. 

Preparar toda documentação necessária para a próxima etapa, mas não executá-la.

---

# 23. ENTREGA FINAL CUMULATIVA

Ao concluir a Fase 8, entregar o:

**PROJETO COMPLETO E CUMULATIVO DAS FASES 2–8.**

Não entregar apenas patch/diff.

Incluir tudo necessário para reconstruir o produto fora do ambiente do agente:

-  código-fonte; 
-  páginas; 
-  componentes; 
-  estilos; 
-  design system; 
-  assets; 
-  migrations desde 001; 
-  SQL; 
-  RLS; 
-  RPCs; 
-  funções; 
-  scripts; 
-  testes; 
-  fixtures; 
-  demo; 
-  configuração; 
- `.env.example`; 
- `package.json`; 
-  lockfile; 
-  README; 
-  AGENTS; 
-  documentação técnica; 
-  documentação operacional; 
-  documentação de planos; 
-  documentação de billing; 
-  documentação de segurança; 
-  guia de instalação; 
-  guia de execução local; 
-  guia da demo; 
-  guia de homologação externa; 
-  relatórios; 
-  inventários; 
-  matrizes; 
-  evidências; 
-  MANIFEST/integridade; 
-  todo arquivo necessário para instalação, manutenção e continuidade. 

O pacote entregue será a **fonte da verdade do produto**.

---

# 24. CRITÉRIOS PARA DECLARAR A FASE 8 CONCLUÍDA

Não declarar conclusão apenas porque as novas telas foram implementadas.

A Fase 8 estará concluída somente quando:

1.  planos estiverem implementados no escopo definido; 
2.  assinatura estiver implementada; 
3.  arquitetura de billing estiver preparada e testável sem cobrança real; 
4.  uso/limites estiverem implementados; 
5.  administração estiver integrada; 
6.  Fases 2–7 continuarem funcionando; 
7.  demo completa estiver funcional; 
8.  página pública tiver acabamento profissional; 
9.  áreas internas tiverem acabamento coerente; 
10.  desktop/mobile estiverem revisados; 
11.  segurança multiempresa estiver preservada; 
12.  regressão estiver concluída; 
13.  falhas críticas conhecidas não estiverem sendo ignoradas; 
14.  limitações externas estiverem documentadas; 
15.  projeto completo estiver entregue. 

---

# 25. ENCERRAMENTO DO DESENVOLVIMENTO POR FASES

**Esta é a última fase prevista.**

Ao terminar:

**PARE.**

Não iniciar “Fase 9”.

Não publicar.

Não iniciar produção.

Não conectar serviços reais.

Entregar:

1. **Projeto-Fase-8-Final.zip** — projeto completo e cumulativo; 
2. **Relatório Final da Fase 8**; 
3. **Guia de Homologação Externa do Produto Completo**; 
4.  demais evidências/documentos necessários. 

A etapa seguinte será autorizada separadamente e será chamada de:

**HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO**

Nessa etapa futura serão realizados Supabase real de teste/homologação, Auth/PostgREST/Storage reais, testes externos, performance, concorrência real, integrações necessárias e correções encontradas.

Somente depois da homologação será discutido piloto e produção.

**Inicie agora a Fase 8 e finalize o desenvolvimento previsto do produto.**