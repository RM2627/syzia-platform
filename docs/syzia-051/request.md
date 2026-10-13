# SYZIA 051 — HOTFIX FINANCEIRO + REDESIGN COMPLETO DO CHECKOUT

## MISSÃO

Trabalhe sobre a versão consolidada SYZIA 050, preservando integralmente os recursos, contratos, migrations, autenticação, isolamento multiempresa e proteções financeiras existentes.

Esta atualização possui dois objetivos igualmente importantes:

1. Corrigir o diagnóstico e investigar a recuperação segura das recusas do Mercado Pago.
2. Redesenhar completamente a experiência de contratação da SYZIA, elevando o padrão de UI/UX do checkout.

**Não entregar apenas propostas visuais, protótipos ou recomendações. Implementar as melhorias reais no código e entregar um pacote incremental testado.**

Não executar deploy nem alterar serviços externos.

---

## PARTE 1 — DIAGNÓSTICO FINANCEIRO

### Cenário real encontrado

Durante a contratação do plano Profissional pela MS Auto Details, o Mercado Pago recusou a solicitação.

O contrato registrado no Supabase apresenta:

- `state=reconciliation`
- `operation=checkout`
- `operation_state=uncertain`
- `error_code=billing_provider_rejected`
- `create_started=false`
- `provider_id=null`
- `trial_reserved=true`

Foram registrados dois eventos `checkout_rejected`, um `checkout_started` e dois `reconciliation_error`.

A consulta oficial de assinaturas por `external_reference` não encontrou resultados na página consultada.

O plano Profissional foi validado na API oficial, apresentando:

- Status `active`.
- Mensalidade R$ 89,90.
- Recorrência mensal.
- Trial de sete dias.
- Vendedor e aplicação de teste corretos.

### Correções obrigatórias

1. Investigar por que a recusa do Mercado Pago é apresentada apenas como `billing_provider_rejected`.
2. Distinguir os status HTTP relevantes do provedor.
3. Implementar diagnóstico seguro, com códigos explicitamente permitidos e sem expor respostas brutas.
4. Identificar recusas de cartão, dados inválidos, comprador incompatível, plano indisponível e falhas temporárias quando houver evidência confiável para distingui-las.
5. Preservar mensagens genéricas para respostas desconhecidas.
6. Não registrar números de cartão, CVV, CPF, e-mail, tokens ou informações financeiras sensíveis.
7. Investigar o estado `uncertain` após uma rejeição definitiva.
8. Propor e implementar somente a recuperação que possa ser demonstrada segura, sem criar duplicações.
9. Preservar a reserva do trial e o histórico financeiro.
10. Não modificar manualmente o contrato real da MS Auto Details.
11. Não conceder acesso pago com base apenas no retorno do navegador.
12. Não relaxar `billing_trial_mismatch`.

**A operação financeira real continua pendente de homologação.**

---

## PARTE 2 — REDESIGN COMPLETO DO CHECKOUT

### Objetivo visual

Criar um checkout moderno, elegante, confiável e profissional, compatível com a identidade visual oficial da SYZIA.

O resultado deve transmitir a qualidade de uma plataforma SaaS consolidada, evitando aparência de formulário administrativo ou página improvisada.

Inspecionar o checkout atual, seus componentes, estilos e fluxo de tokenização antes de implementar.

### 2.1 Estrutura da página

Organizar a experiência em duas áreas principais no desktop:

**Área de contratação:**

- Título objetivo.
- Formulário de pagamento.
- Campos organizados.
- Orientações contextuais.
- Validações próximas aos campos.
- Botão principal de confirmação.

**Área de resumo:**

- Nome do plano.
- Valor mensal.
- Benefícios reais.
- Quantidade de integrantes permitidos.
- Elegibilidade ao período gratuito.
- Valor inicial, quando comprovado.
- Data de primeira cobrança, quando confirmada.
- Condições de renovação e cancelamento.

No celular, utilizar uma única coluna, com o resumo em posição facilmente acessível e o botão principal visível sem sobreposição.

Não utilizar layout apertado ou texto excessivamente pequeno.

### 2.2 Identidade visual

Preservar a identidade oficial da SYZIA.

Aplicar:

- Hierarquia tipográfica consistente.
- Espaçamentos equilibrados.
- Bordas discretas.
- Cartões modernos.
- Cores e contrastes coerentes.
- Estados de foco acessíveis.
- Ícones funcionais.
- Animações discretas, respeitando redução de movimento.

Evitar efeitos exagerados, gradientes genéricos, excesso de roxo e elementos decorativos que prejudiquem a leitura.

### 2.3 Campos de pagamento

Melhorar os campos existentes sem comprometer a tokenização do Mercado Pago.

Implementar, quando compatível:

- Máscara visual para número do cartão.
- Validação de validade.
- Formatação do nome do titular.
- Validação de identificação.
- Mensagens de erro junto ao campo correspondente.
- Estados visuais de foco, erro e preenchimento.
- Autocomplete apropriado, sem armazenamento indevido.
- Navegação por teclado.
- Labels persistentes e acessíveis.

**Segurança obrigatória:**

Não enviar dados brutos do cartão ao backend da SYZIA.

Não registrar informações sensíveis em logs, analytics, erros ou armazenamento persistente.

Preservar a tokenização pelo Mercado Pago e as fronteiras de segurança existentes.

Não criar formulários fictícios nem simular aprovação de pagamento.

### 2.4 Resumo financeiro transparente

O usuário precisa compreender exatamente o que está contratando.

Apresentar:

- Plano selecionado.
- Mensalidade.
- Período de cobrança.
- Condições do trial.
- Elegibilidade.
- Valor devido no início, quando confirmado.
- Data de primeira cobrança, quando comprovada.
- Política de cancelamento.

**Regra crítica:** não apresentar uma data estimada de cobrança como se tivesse sido confirmada pelo Mercado Pago.

Se o provedor ainda não tiver confirmado a aplicação do trial, usar comunicação verdadeira e impedir conclusões financeiras indevidas.

Não anunciar cobrança de R$ 0,00 como fato consumado antes de validar a condição aplicável.

### 2.5 Experiência de contratação

Criar estados claros para:

1. Carregamento inicial.
2. Verificação de elegibilidade.
3. Plano incompatível com a equipe.
4. Preenchimento dos dados.
5. Tokenização do cartão.
6. Envio da contratação.
7. Processamento.
8. Reconciliação pendente.
9. Recusa definitiva.
10. Assinatura confirmada.

Durante uma operação pendente ou incerta, não permitir repetição automática de POST de criação.

O botão deve indicar claramente a ação e impedir múltiplos cliques.

A interface deve orientar o usuário sobre o próximo passo, sem sugerir nova tentativa quando ainda houver risco de duplicação.

### 2.6 Mensagens de erro

Substituir mensagens genéricas quando existir diagnóstico confiável.

Exemplos de comunicação desejada:

**Cartão recusado:**
"O meio de pagamento não foi autorizado. Confira as informações ou utilize outro cartão."

**Plano incompatível:**
"O plano selecionado permite menos integrantes do que a equipe atual. Nenhum vínculo foi alterado."

**Resultado incerto:**
"Estamos verificando a solicitação. Não é necessário enviar o pagamento novamente."

**Indisponibilidade temporária:**
"Não foi possível concluir a verificação agora. Você pode consultar a situação da solicitação."

Esses textos são exemplos. Não atribuir uma causa específica sem confirmação do provedor.

Não exibir códigos internos, stack traces ou detalhes de infraestrutura ao usuário.

### 2.7 Confirmação da assinatura

Após confirmação oficial, apresentar uma tela com:

- Plano contratado.
- Situação da assinatura.
- Valor e ciclo.
- Data de renovação confirmada.
- Período gratuito efetivamente reconhecido.
- Próximas etapas.
- Acesso ao gerenciamento da assinatura.

Não exibir sucesso enquanto a contratação estiver pendente ou em reconciliação.

---

## PARTE 3 — RESPONSIVIDADE E ACESSIBILIDADE

Testar o checkout em:

- Desktop 1440 px.
- Tablet 768 px.
- Celular 390 px.
- Celular pequeno 320 px.

Garantir ausência de cortes, rolagem horizontal, campos inacessíveis ou botões sobrepostos.

Validar contraste, foco, labels, mensagens de erro, navegação por teclado e leitores de tela nos fluxos relevantes.

---

## PARTE 4 — TESTES

Executar testes específicos e de regressão.

### Financeiros

- Recusa definitiva.
- Resultado incerto.
- Timeout.
- Falha de autenticação.
- Plano inválido.
- Trial incompatível.
- Webhook duplicado.
- Idempotência.
- Reconciliação.
- Isolamento entre empresas.
- Ausência de criação duplicada.
- Ausência de concessão indevida de acesso.

### UI/UX

- Preenchimento e validação.
- Campos vazios e inválidos.
- Tokenização simulada.
- Botão desabilitado durante envio.
- Mensagens contextualizadas.
- Erro e recuperação.
- Resumo financeiro.
- Responsividade.
- Acessibilidade.
- Confirmação apenas após estado oficial.

Utilizar fixtures e dados fictícios.

Não utilizar credenciais reais nem executar cobranças externas.

Executar build e gate completo, preservando os testes históricos.

---

## PARTE 5 — PRESERVAÇÃO

Não alterar:

- Preços dos planos.
- Sete dias de trial.
- Regras de elegibilidade.
- Limites de integrantes.
- Permissões.
- Autenticação.
- RLS.
- Isolamento multiempresa.
- Regras de cancelamento.
- Proteções HMAC.
- Documentos jurídicos.
- Histórico de aceites.
- Dados reais de empresas.

Se alguma alteração de banco for indispensável, justificar e entregar migration incremental, sem executá-la.

Não remover testes nem enfraquecer validações para obter aprovação artificial.

---

## PARTE 6 — ENTREGA

Entregar:

1. ZIP incremental da SYZIA 051.
2. Checkout visualmente reformulado e funcional.
3. Correção segura do diagnóstico financeiro.
4. Relatório técnico.
5. Matriz de testes.
6. Capturas de desktop e celular.
7. Guia de instalação.
8. Instruções de rollback.
9. Pendências de homologação externa claramente identificadas.

Não executar deploy, push, alterações no Supabase ou cobranças.

## RESULTADO FINAL ESPERADO

Uma experiência de contratação profissional, intuitiva e segura, com identidade visual consistente e diagnóstico financeiro útil.

A SYZIA deve comunicar claramente o que está acontecendo em cada etapa, evitando confusão, cobranças duplicadas e falsas confirmações.

**A qualidade visual deve evoluir sem comprometer a segurança financeira construída nas versões anteriores.**