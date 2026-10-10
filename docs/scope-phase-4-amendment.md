Continue a FASE 4 — CONSUMIDOR exatamente do ponto em que o desenvolvimento foi interrompido.

NÃO reinicie a fase. Antes de continuar, inspecione o estado atual dos arquivos e preserve integralmente tudo que já estiver correto, implementado e validado.

Mantenha todas as decisões arquiteturais, regras de segurança, isolamento multiempresa, RLS/FORCE RLS, validações server-side/database, idempotência, auditoria e limites de escopo definidos anteriormente.

A homologação externa em Supabase real continua podendo permanecer PENDENTE DE HOMOLOGAÇÃO EXTERNA quando depender de conta, credenciais ou serviços reais. Isso não deve impedir a continuidade do desenvolvimento local da fase.

Além do escopo original da Fase 4, incorpore os seguintes aprimoramentos.

## 1. PERSONALIZAÇÃO DA PÁGINA PÚBLICA

A página `/empresa/:slug` deve funcionar como uma presença digital profissional da empresa, mantendo um design-base consistente da plataforma.

Permitir configuração controlada de elementos como:

- logo;
- banner/capa;
- cor principal;
- nome;
- descrição;
- informações públicas;
- regiões atendidas;
- horários;
- formas de pagamento;
- imagens;
- organização visual do catálogo.

Não transformar isso em um construtor livre de sites.

Não permitir HTML, JavaScript ou CSS arbitrário fornecido pela empresa.

## 2. PORTFÓLIO / GALERIA

Adicionar estrutura para a empresa apresentar trabalhos realizados.

Cada item poderá possuir, conforme aplicável:

- título;
- descrição curta;
- imagem ou conjunto limitado de imagens;
- serviço relacionado;
- ordem;
- ativo/inativo;
- formato antes/depois quando apropriado.

O recurso deve funcionar especialmente bem para segmentos como estética automotiva, higienização, salões, fotografia, personalização, manutenção e outros serviços visuais.

Arquivos internos/privados jamais poderão se tornar públicos apenas por manipulação de identificadores.

## 3. ORÇAMENTO VISUAL PROFISSIONAL

O orçamento apresentado ao consumidor deve possuir experiência visual adequada para fechamento comercial, contendo conforme aplicável:

- empresa;
- serviço;
- adicionais;
- informações fornecidas;
- itens;
- valores;
- total;
- observações;
- validade;
- versão;
- status.

Disponibilizar ações apropriadas como:

- aprovar;
- recusar;
- seguir para agendamento quando permitido.

Preservar versionamento, validade, segurança e idempotência.

## 4. LINHA DO TEMPO DA SOLICITAÇÃO

Criar acompanhamento baseado exclusivamente em eventos reais.

Exemplos:

Solicitação recebida
→ Em análise
→ Orçamento disponível
→ Orçamento aprovado
→ Agendamento realizado
→ Serviço realizado.

Não inventar etapas futuras nem marcar eventos que efetivamente não aconteceram.

## 5. EXPERIÊNCIA DO CLIENTE RECORRENTE

Reduzir preenchimentos repetitivos no mesmo dispositivo/sessão quando isso puder ser feito com segurança.

Telefone, armazenamento local ou informações previamente preenchidas NÃO constituem autenticação ou prova de identidade.

Preservar o modelo seguro de acesso já definido.

## 6. PREPARAÇÃO PARA NOTAS E TAGS INTERNAS

Preparar estrutura simples para informações operacionais como:

- cliente recorrente;
- horário preferido;
- observação operacional;
- origem/contexto.

Essas informações são INTERNAS.

Não devem aparecer na página pública nem para outros consumidores.

Não transformar isso em CRM complexo nesta fase.

## 7. ORIGEM DO CLIENTE

Permitir registrar origem quando conhecida, por exemplo:

- Instagram;
- Google;
- indicação;
- WhatsApp;
- acesso direto;
- outro.

Isso deverá permitir métricas comerciais futuras sem implementar sistema complexo de atribuição nesta fase.

## 8. PREPARAÇÃO PARA INDICAÇÕES

Preparar apenas a relação básica necessária para futuramente saber que determinado consumidor veio por indicação de outro cliente/origem.

NÃO implementar agora:

- cashback;
- carteira;
- saldo;
- saque;
- pontos;
- programa financeiro de indicação.

## 9. EXPERIÊNCIA COMERCIAL COMPLETA

A experiência pública deverá combinar de maneira profissional:

IDENTIDADE DA EMPRESA

- APRESENTAÇÃO
- PORTFÓLIO
- SERVIÇOS
- PREÇOS/ORÇAMENTO
- AGENDA
- FAQ
- ACOMPANHAMENTO DA SOLICITAÇÃO.

A intenção é que a página seja percebida pelo pequeno prestador como sua própria presença digital profissional dentro da plataforma, sem virar um construtor completo de sites.

## 10. PREPARAÇÃO PARA A CENTRAL DE ATENDIMENTO

Organize os dados gerados nesta fase para que a futura Fase 5 consiga apresentar rapidamente ao atendente:

- empresa;
- consumidor;
- serviço de interesse;
- orçamento;
- agendamento;
- origem;
- estado atual;
- histórico;
- próxima ação necessária.

NÃO implemente a Central de Atendimento completa nesta fase.

---

# 11. PREPARAÇÃO PARA PAGAMENTOS DO CONSUMIDOR

A plataforma também deverá ser preparada para que futuramente o consumidor POSSA realizar pagamento ou sinal do serviço dentro da própria jornada da plataforma.

Entretanto, existe uma regra de produto fundamental:

**O pagamento através da plataforma será OPCIONAL.**

A empresa NÃO será obrigada a receber os pagamentos de seus clientes através da plataforma.

A plataforma deverá suportar tanto pagamentos integrados futuros quanto pagamentos realizados externamente.

## 11.1 FORMAS DE RECEBIMENTO

A empresa poderá configurar os meios de pagamento que aceita, incluindo futuramente, conforme aplicável:

- pagamento online integrado pela plataforma;
- Pix externo/próprio da empresa;
- cartão presencial/maquininha;
- dinheiro;
- transferência;
- outro meio externo configurado.

Portanto:

**usar nossa plataforma para receber o pagamento do serviço NÃO será requisito para utilizar orçamento, agendamento, atendimento ou qualquer outra funcionalidade principal.**

Uma empresa poderá utilizar toda a plataforma e continuar recebendo seus clientes da maneira que já utiliza hoje.

## 11.2 PAGAMENTO INTEGRADO FUTURO

Quando a empresa optar pelo pagamento online integrado, o modelo pretendido inicialmente será:

CLIENTE
→ interface da plataforma
→ gateway/provedor de pagamento
→ EMPRESA PRESTADORA recebe o valor.

Evitar inicialmente:

CLIENTE
→ dinheiro fica sob custódia da nossa plataforma
→ plataforma posteriormente repassa para empresa.

Não implementar carteira financeira própria ou custódia de dinheiro nesta fase.

## 11.3 PAGAMENTO EXTERNO

A arquitetura também deverá suportar situações como:

Orçamento aprovado
→ cliente escolhe/agente informa pagamento externo
→ empresa recebe por Pix próprio, dinheiro, maquininha ou outro meio
→ pagamento pode posteriormente ser registrado/confirmado no sistema por usuário autorizado.

É essencial diferenciar:

PAGAMENTO CONFIRMADO AUTOMATICAMENTE PELO PROVEDOR

de

PAGAMENTO EXTERNO REGISTRADO/CONFIRMADO MANUALMENTE.

Nunca apresentar uma confirmação manual como se tivesse sido validada automaticamente por um gateway.

Registrar origem/método da confirmação para auditoria.

## 11.4 PAGAMENTO NÃO DEVE BLOQUEAR A JORNADA INDEVIDAMENTE

A empresa deverá poder definir regras como:

- nenhum pagamento antecipado;
- pagamento somente no atendimento;
- sinal obrigatório;
- sinal opcional;
- pagamento integral antecipado.

Quando nenhum pagamento antecipado for exigido, o consumidor deverá conseguir prosseguir normalmente para o agendamento conforme as demais regras da empresa.

## 11.5 SINAL

Preparar suporte futuro para sinal:

- valor fixo;
- percentual do orçamento/serviço.

O cálculo deverá ser validado no backend/banco e nunca confiado exclusivamente ao frontend.

## 11.6 RELAÇÃO COM ORÇAMENTO

Preparar:

Solicitação
→ orçamento
→ versão final
→ aprovação
→ eventual pagamento/sinal
→ agendamento/confirmação conforme as regras da empresa.

Um pagamento deverá estar associado à versão correta do orçamento.

Alterações posteriores no orçamento não podem modificar silenciosamente uma cobrança já criada.

## 11.7 RELAÇÃO COM AGENDAMENTO

Preparar cenários como:

- agendamento sem pagamento;
- pagamento somente presencial;
- reserva aguardando sinal;
- pagamento/sinal confirmado → reserva confirmada;
- cobrança não paga dentro do prazo → tratamento conforme regra futura;
- cancelamento;
- remarcação;
- eventual reembolso.

Pagamento e agendamento são estados relacionados, mas distintos.

Não manter horário bloqueado indefinidamente por cobrança abandonada. A arquitetura deverá permitir futura expiração de reservas pendentes.

## 11.8 STATUS

Preparar modelo explícito de estados financeiros, refinando nomenclatura se necessário:

- não requerido;
- pendente;
- aguardando confirmação;
- sinal pago/pago parcialmente;
- pago;
- falhou;
- expirado;
- cancelado;
- reembolso pendente;
- reembolsado.

Para pagamentos externos, registrar também que a confirmação foi manual/externa quando aplicável.

## 11.9 REGISTROS

Preparar entidades/campos apropriados para futuramente relacionar:

- organização;
- consumidor;
- orçamento;
- versão do orçamento;
- agendamento;
- valor;
- moeda;
- tipo: total/sinal;
- método;
- origem: integrado/externo;
- status;
- provedor quando houver;
- identificador externo quando houver;
- datas relevantes;
- valor confirmado;
- eventual reembolso;
- histórico das mudanças;
- responsável por confirmação manual quando houver.

Não armazenar dados sensíveis de cartão.

## 11.10 EXPERIÊNCIA DO CONSUMIDOR

A interface deverá ficar preparada para diferentes situações.

Exemplo com pagamento integrado:

Orçamento aprovado — R$300

Sinal necessário — R$90

[Pagar sinal]

Exemplo sem pagamento antecipado:

Orçamento aprovado — R$300

[Escolher horário]

Exemplo de pagamento externo:

Forma combinada: Pix diretamente para a empresa

[Continuar]

A experiência deve se adaptar às regras da empresa.

NÃO criar botão ou fluxo que simule uma transação real nesta fase como se gateway já estivesse integrado.

Mocks são permitidos apenas para desenvolvimento/testes e devem estar claramente identificados.

## 11.11 CONFIGURAÇÕES DA EMPRESA

Preparar arquitetura para futuramente configurar:

- aceita ou não pagamento online integrado;
- formas externas aceitas;
- exige ou não pagamento antecipado;
- exige ou não sinal;
- sinal fixo ou percentual;
- serviços aos quais a regra se aplica;
- pagamento presencial;
- regras de cancelamento/reembolso.

A empresa deve continuar tendo liberdade para utilizar seus próprios meios de recebimento.

## 11.12 ABSTRAÇÃO DO GATEWAY

NÃO acoplar irreversivelmente o projeto a um gateway específico nesta fase.

Preparar uma camada/abstração que permita posteriormente avaliar provedores adequados ao mercado brasileiro, especialmente Pix e cartão.

A escolha do gateway será feita posteriormente.

## 11.13 SEGURANÇA FINANCEIRA

Preservar:

- valores calculados e validados no servidor/banco;
- idempotência;
- nenhum dado sensível de cartão armazenado;
- nenhuma chave secreta no frontend;
- navegador não determina valor final;
- isolamento entre organizações;
- isolamento entre consumidores;
- histórico financeiro relevante;
- auditoria de confirmações manuais;
- futura verificação segura de callbacks/webhooks;
- pagamento sempre associado à organização correta.

## 11.14 TESTES

Adicionar testes apropriados garantindo pelo menos:

- empresa A não acessa configurações financeiras da empresa B;
- consumidor A não acessa registros financeiros do consumidor B;
- cobrança não pode ser associada a orçamento de outra organização;
- valor manipulado no frontend não substitui valor autorizado;
- sinal fixo/percentual respeita configuração;
- versão errada de orçamento não é vinculada silenciosamente;
- pagamento e agendamento permanecem estados distintos;
- pagamento externo não é apresentado como confirmação automática;
- usuário não autorizado não pode marcar pagamento externo como pago;
- nenhuma informação financeira interna aparece na página pública;
- schema não prevê armazenamento de número completo de cartão/CVV.

## 11.15 NÃO IMPLEMENTAR NESTA FASE

Não implementar agora:

- gateway real;
- Pix integrado real;
- cartão real;
- split real;
- webhooks reais;
- cobrança real;
- carteira;
- saldo;
- saque;
- custódia;
- antecipação;
- repasse manual;
- conciliação financeira complexa;
- assinatura real das empresas.

A Fase 4 deverá apenas construir uma base compatível e evitar retrabalho futuro.

A implementação financeira efetiva ficará para a fase apropriada.

---

## 12. NÃO EXPANDIR O ESCOPO PARA

Não adicionar agora:

- financeiro completo;
- estoque;
- fiscal;
- ERP;
- CRM complexo;
- cashback;
- carteira;
- programa de fidelidade;
- campanhas;
- WhatsApp Business API;
- chatbot;
- IA;
- aplicativo nativo.

## 13. SEGURANÇA E REGRESSÃO

Preserve integralmente:

- RLS/FORCE RLS;
- isolamento por organização;
- isolamento por consumidor;
- projeções públicas seguras;
- armazenamento privado quando necessário;
- validações no backend/banco;
- snapshots/versionamento;
- idempotência;
- auditoria;
- ausência de chaves privilegiadas no frontend.

Além dos testes já previstos na Fase 4, valide que:

- empresa A não altera portfólio/personalização de B;
- conteúdo interno não aparece publicamente;
- arquivo privado não vira público por troca de ID;
- personalização não aceita conteúdo executável;
- consumidor não altera valores do orçamento;
- timeline não expõe eventos de outro consumidor;
- origem, indicação, tags e notas internas não vazam publicamente.

## 14. REGRA PERMANENTE DE ENTREGA COMPLETA

Ao concluir esta fase, preserve e entregue o PROJETO COMPLETO E ATUALIZADO.

Não quero apenas patches, diffs ou arquivos modificados.

A entrega deve conter TODOS os arquivos necessários para que o projeto seja independente deste ambiente e desta conversa, incluindo:

- todo código-fonte;
- páginas;
- componentes;
- estilos;
- assets;
- package.json;
- lockfile;
- todas as migrations desde a primeira;
- schemas;
- SQL;
- RLS;
- funções/RPCs;
- scripts;
- testes;
- fixtures;
- configurações;
- `.env.example`;
- README;
- AGENTS.md;
- documentação;
- guias de instalação;
- guia de homologação;
- guia de build;
- preparação para deploy futuro;
- relatórios/matrizes de teste;
- qualquer outro arquivo necessário.

Nenhuma parte obrigatória do projeto pode existir apenas no ambiente do agente ou nesta conversa.

A fonte da verdade deve ser o projeto entregue.

## 15. CONTINUIDADE

Continue a Fase 4 do estado atual.

Preserve tudo que já estiver correto.

Execute novamente os testes de regressão necessários.

Atualize a documentação.

Diferencie claramente:

DESENVOLVIMENTO LOCAL = executado/testado;

HOMOLOGAÇÃO EXTERNA = pendente quando depender de Supabase real, contas, credenciais ou serviços externos;

PRODUÇÃO/LANÇAMENTO = exclusivamente minha responsabilidade.

NÃO faça deploy.

NÃO publique a aplicação.

NÃO contrate ou ative serviços pagos.

NÃO utilize clientes reais.

NÃO processe pagamentos reais.

NÃO inicie a Fase 5.

Ao finalizar a Fase 4, entregue o relatório completo da fase e PARE para minha aprovação.