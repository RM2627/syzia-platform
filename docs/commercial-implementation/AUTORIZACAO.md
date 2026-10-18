# SYZIA — AUTORIZAÇÃO OFICIAL DE IMPLEMENTAÇÃO COMERCIAL

**Base oficial:** commit `4b33f42`  
**Referência visual:** protótipo comercial R2  
**Situação:** implementação autorizada, com requisitos obrigatórios de segurança e homologação.

## 1. Aprovação formal

Aprovo a revisão R2 do protótipo comercial da SYZIA, incluindo:

- Identidade visual e logo com transparência real.
- Integração da Gestão Comercial ao painel administrativo existente.
- Barra lateral idêntica à modernização oficial.
- Gerenciamento de interessados e acompanhamento comercial.
- Criação e gerenciamento de demonstrações.
- Biblioteca de templates.
- Convites individuais e coletivos por e-mail.
- Ativação vinculada da empresa.
- Fluxos e funcionalidades apresentados no protótipo.

Autorizo o início da implementação operacional dessas funcionalidades, respeitando a arquitetura existente e as determinações abaixo.

## 2. Exigência principal — Demonstração equivalente à empresa real

**A demonstração deverá utilizar a experiência real da SYZIA, e não constituir uma segunda plataforma simplificada.**

O objetivo é permitir que eu configure uma empresa demonstrativa praticamente da mesma forma que configuro uma empresa real.

O Work deverá reutilizar, sempre que tecnicamente viável, os mesmos componentes, modelos de dados, regras de apresentação e funcionalidades da plataforma oficial.

A demonstração deverá oferecer:

**A. Configuração da empresa**

Permitir preparar uma empresa demonstrativa com:

- Nome, descrição, identidade visual e logotipo.
- Segmento de atuação.
- Catálogo de serviços, preços e duração.
- Horários de funcionamento e disponibilidade.
- Equipe e profissionais fictícios, quando aplicável.
- Portfólio e informações institucionais.
- Configurações compatíveis com o plano demonstrado.
- Escolha do template da página pública.

A configuração deverá refletir a estrutura utilizada pelas empresas reais, respeitando o isolamento dos dados demonstrativos.

**B. Página pública demonstrativa**

Cada demonstração deverá possuir uma página pública personalizada, equivalente à página disponibilizada para uma empresa assinante.

O visitante deverá conseguir visualizar a apresentação da empresa, serviços, informações e demais elementos compatíveis com o template selecionado.

A página não poderá ser apenas uma imagem estática ou uma reprodução visual sem funcionamento.

Os fluxos interativos compatíveis deverão operar em ambiente demonstrativo, utilizando dados fictícios e sem produzir efeitos externos reais.

**C. Acesso à plataforma por dentro**

O interessado também deverá conseguir conhecer o painel interno da empresa demonstrativa.

Essa experiência deverá reproduzir, com fidelidade, as funcionalidades disponíveis para uma empresa real no plano apresentado, incluindo, quando aplicável:

- Home e indicadores.
- Agenda e disponibilidade.
- Atendimento.
- Solicitações e orçamentos.
- Pendências e acompanhamento.
- Serviços e catálogo.
- Equipe e profissionais.
- Métricas e relatórios.
- Configurações e personalização da empresa.

As funcionalidades demonstradas deverão funcionar de maneira coerente com a plataforma real, e não apenas apresentar telas decorativas.

Não criar componentes paralelos desnecessários. Priorizar a reutilização dos módulos existentes.

Permitir operações demonstrativas seguras, com dados fictícios, sem executar cobranças, enviar mensagens reais, modificar dados de clientes ou gerar operações financeiras.

O acesso demonstrativo deverá possuir permissões limitadas, isolamento por empresa, validade e mecanismos de revogação.

Não permitir acesso às áreas administrativas globais, credenciais, dados de outros assinantes ou funções sensíveis.

**A experiência precisa ser suficientemente fiel para que o interessado saiba como seria utilizar a SYZIA após contratar.**

## 3. Links exclusivos e opção de copiar

Cada empresa demonstrativa deverá possuir um link exclusivo de acesso.

Na área Gestão Comercial → Demonstrações, implementar a opção **Copiar link da demonstração**.

Requisitos:

- Copiar o endereço completo com um clique.
- Exibir confirmação visual da cópia.
- Permitir compartilhar o endereço manualmente pelo WhatsApp, Instagram ou outros canais.
- Oferecer acesso à página pública demonstrativa.
- Disponibilizar uma entrada claramente identificada para conhecer o painel interno.
- Garantir que o link esteja associado à demonstração correta.
- Permitir revogar ou regenerar o acesso quando necessário.
- Respeitar validade e permissões configuradas.

A página pública poderá ser acessível pelo link de compartilhamento, enquanto o painel interno deverá utilizar uma sessão demonstrativa restrita, sem expor credenciais administrativas.

Os links não poderão conceder automaticamente a propriedade de uma empresa real.

## 4. Compartilhamento por e-mail

Implementar o envio de convites de demonstração por e-mail, aproveitando a infraestrutura de comunicação existente da SYZIA.

**Envio individual**

Selecionar um interessado e enviar o convite personalizado, contendo a identificação da empresa, a apresentação da SYZIA e o link correspondente à demonstração.

**Envio coletivo**

Permitir selecionar múltiplos interessados e enviar os respectivos convites em uma única operação administrativa.

Também deverá existir a opção de selecionar todos os contatos elegíveis de uma lista filtrada.

O envio coletivo deverá:

- Exigir confirmação antes da execução.
- Personalizar o destinatário e o link.
- Não revelar os e-mails dos demais interessados.
- Impedir envios duplicados indevidos.
- Registrar sucesso e falha por destinatário.
- Aplicar limites de volume e mecanismos antispam.
- Respeitar as permissões e a finalidade autorizada do contato.
- Permitir exclusão de destinatários antes do envio.

Manter modelos de e-mail consistentes com a identidade visual oficial da SYZIA.

Não realizar envios reais durante a homologação.

## 5. Ativação vinculada à demonstração

Quando o interessado decidir testar a plataforma, deverá ser possível enviar um convite de ativação associado à empresa previamente preparada.

O responsável deverá poder concluir seu cadastro e ativar a empresa sem precisar refazer desnecessariamente todas as configurações.

O processo deverá contemplar:

1. Identificação e autenticação do responsável.
2. Comprovação segura de vínculo com a empresa.
3. Revisão e confirmação dos dados preparados.
4. Seleção do plano.
5. Aceitação dos termos aplicáveis.
6. Vinculação do meio de pagamento.
7. Início do trial de sete dias, conforme as regras financeiras existentes.

**A ativação deverá aproveitar somente as configurações autorizadas.**

Dados fictícios de atendimentos, agendamentos, clientes, orçamentos e métricas não poderão ser transferidos para o ambiente real.

Não iniciar trial, assinatura ou cobrança antes da confirmação válida exigida pelo fluxo existente.

O convite de ativação também deverá possuir opção de copiar link e envio individual por e-mail. Qualquer envio coletivo de ativações deverá exigir seleção e confirmação explícitas de empresas e responsáveis elegíveis, com links individualizados.

## 6. Gestão Comercial integrada

Manter as funcionalidades dentro do painel administrativo oficial da SYZIA, no grupo **Gestão Comercial**:

- Interessados.
- Demonstrações.
- Templates.
- Convites.
- Ativações.

Preservar a navegação do commit `4b33f42`.

As funcionalidades comerciais serão acessíveis exclusivamente ao administrador da plataforma e aos operadores expressamente autorizados.

Empresas assinantes não poderão acessar essas ferramentas.

As informações comerciais deverão permanecer separadas dos dados operacionais e financeiros dos assinantes.

## 7. Templates da página pública

Implementar a biblioteca de templates prevista no protótipo aprovado.

A escolha do template deverá alterar a apresentação visual da página pública, preservando os dados, serviços e funcionalidades da empresa.

Os templates deverão funcionar tanto nas demonstrações quanto nas páginas públicas reais, respeitando as regras de personalização e os recursos disponíveis em cada plano.

Evitar manter duas implementações independentes da página pública.

## 8. Decisões técnicas D01–D08

Utilizar os documentos técnicos já produzidos como referência.

As decisões D01–D08 deverão ser revisadas à luz desta autorização.

Quando uma decisão estiver claramente resolvida pelos requisitos acima, registrar sua resolução e justificativa.

Quando houver alternativas arquiteturais relevantes, riscos financeiros, impactos na autenticação ou alterações potencialmente incompatíveis com a base oficial, não presumir aprovação automática.

Documentar a decisão recomendada e solicitar autorização específica antes de implementar a parte afetada.

A autorização geral não permite modificar indiscriminadamente mecanismos financeiros ou de segurança já homologados.

## 9. Preservação da plataforma

É obrigatório preservar:

- Autenticação e recuperação de senha.
- Isolamento multiempresa.
- Permissões e controle de acesso.
- Sistema de convites existente.
- Planos e trial.
- Integração com Mercado Pago.
- Webhooks e integridade financeira.
- Atendimento compartilhado.
- Agenda, orçamentos e demais funcionalidades atuais.
- Modernização UI/UX aprovada.

Não substituir funcionalidades operacionais por versões simplificadas para atender à demonstração.

A implementação deverá ser incremental, auditável e reversível.

## 10. Entrega e homologação

Realizar a implementação em ambiente isolado, utilizando a base oficial fornecida.

Entregar:

1. Código-fonte completo das alterações.
2. Migrations necessárias, sem execução em produção.
3. Documentação de arquitetura e decisões.
4. Inventário dos arquivos modificados.
5. Relatório de integridade e hashes.
6. Testes automatizados e resultados.
7. Testes dos fluxos de demonstração e ativação.
8. Testes de permissões e isolamento multiempresa.
9. Testes dos envios individuais e coletivos com serviços simulados.
10. Instruções de integração segura pelo PowerShell.

Incluir testes que comprovem que a página pública e o painel interno da demonstração utilizam os fluxos reais autorizados, e não apenas interfaces ilustrativas.

**Não realizar push, deploy, envios reais de e-mail, cobranças, alterações no Supabase de produção ou modificações no Render, Cloudflare e Mercado Pago.**

A integração à plataforma publicada dependerá de homologação e autorização posteriores.

## 11. Critério final de aprovação

A implementação somente será considerada concluída quando for possível:

- Criar e configurar uma empresa demonstrativa.
- Visualizar sua página pública personalizada.
- Copiar e compartilhar seu link.
- Acessar e experimentar o painel interno demonstrativo.
- Enviar convites individuais e coletivos por e-mail.
- Acompanhar interessados e seus status.
- Enviar um convite de ativação vinculado.
- Converter a preparação demonstrativa em empresa real, com segurança e sem importar dados fictícios.
- Comprovar que as funcionalidades existentes da SYZIA continuam preservadas.

**Esta autorização contempla o desenvolvimento completo do ambiente comercial, mas não autoriza publicação em produção.**

Iniciar a implementação conforme essas determinações e apresentar a entrega para homologação antes de qualquer integração definitiva.