# Regra permanente — desenvolvimento e entrega de arquivos

Instrução expressa de Marcelo. Aplica-se a todas as fases deste projeto e prevalece sobre qualquer orientação anterior que sugira publicação automática ou trate lançamento como parte da entrega do desenvolvimento.

## Trabalho autorizado

Desenvolver, organizar, testar e entregar o projeto com seus arquivos, exclusivamente dentro de cada fase aprovada. O resultado deve ser organizado, portátil, baixável e apto a ser armazenado e versionado pelo usuário.

Podem ser preparados código-fonte, estrutura de pastas, migrations SQL, configurações, `.env.example`, scripts, documentação, README, instruções de instalação, configuração do Supabase, build e deploy, checklist de lançamento, testes automatizados e dados fictícios necessários ao desenvolvimento/teste.

## Responsabilidade exclusiva de Marcelo

O lançamento e a publicação serão feitos pelo próprio Marcelo posteriormente. O agente não deve:

- publicar a aplicação em produção;
- executar deploy na Vercel ou em qualquer outro serviço, inclusive como etapa automática de conclusão;
- contratar ou ativar serviços pagos;
- comprar ou configurar domínio em produção;
- realizar lançamento público;
- disponibilizar a plataforma para clientes reais;
- utilizar dados reais de clientes, inclusive da MS Auto Details;
- tomar decisões de produção ou lançamento em nome do usuário.

Preparar instruções ou arquivos de deploy não autoriza executá-los. Gerar um build local não equivale a publicar. Entregar um ZIP ou versionar arquivos não autoriza acionar um pipeline de publicação. Antes de qualquer versionamento externo autorizado, verificar se ele dispararia deploy; não dispará-lo sob esta regra.

## Homologação técnica externa

Uma fase aprovada pode envolver preparação ou execução de testes técnicos em serviço externo, mas isso nunca presume autorização para publicar, lançar, contratar serviços pagos ou usar dados reais.

Explicar exatamente o ambiente e as configurações necessárias. Quando houver dependência de credenciais, conta, projeto ou ação que deva ser realizada pelo usuário, deixar instruções preparadas para ele executar. Não exigir conexão externa para continuar uma tarefa que possa ser concluída localmente.

Utilizar exclusivamente contas e empresas fictícias de teste. Não relaxar RLS, constraints ou autorização para facilitar homologação. Não solicitar segredos para incorporá-los ao frontend, ao pacote ou aos exemplos.

Registrar separadamente testes locais, testes externos efetivamente executados e testes pendentes com seus motivos. Nunca declarar homologação de ambiente real com base apenas em mocks ou execução local. O lançamento não é requisito para concluir a entrega dos arquivos nem prova de homologação.

## Controle de fases

Não avançar para a fase seguinte sem autorização expressa de Marcelo. A aprovação de desenvolvimento/teste não é aprovação de produção.

## Distinção permanente aprovada para a Fase 3

1. **DESENVOLVIMENTO:** código, migrations, testes, interfaces, documentação, scripts e dados fictícios são autorizados dentro de cada fase aprovada.
2. **HOMOLOGAÇÃO EXTERNA:** dependências de conta, credenciais, Supabase real, SMTP ou provedor são documentadas como **PENDENTE DE HOMOLOGAÇÃO EXTERNA**. Preparar arquivos e instruções para Marcelo executar. Essa pendência não bloqueia o desenvolvimento de fases aprovadas quando houver caminho local com mocks e fixtures. Nunca declarar execução real a partir de testes locais. Preservar os guias e ferramentas já entregues.
3. **PRODUÇÃO E LANÇAMENTO:** responsabilidade exclusiva de Marcelo. Todas as proibições de deploy, publicação, contratação, planos pagos, domínio de produção, clientes reais e uso do banco real da MS Auto Details continuam vigentes.

Estado atual: Fundação aprovada para continuidade do DESENVOLVIMENTO; homologação real pendente; Fase 3 — Empresa expressamente autorizada. Encerrar após implementar, testar localmente, documentar e entregar seus arquivos. **Fase 4 não autorizada.**

Encerramento da Fase 3: desenvolvimento implementado e testado localmente, aguardando revisão de Marcelo. Homologação externa continua pendente. Não iniciar Fase 4.

## Autorização posterior — Fase 4

Marcelo aprovou a Fase 3 para continuidade do DESENVOLVIMENTO e autorizou exclusivamente a Fase 4 — Consumidor. Esta autorização substitui as pausas anteriores referentes à Fase 4. Homologação externa das fases anteriores e desta fase permanece PENDENTE DE HOMOLOGAÇÃO EXTERNA; produção/lançamento continuam exclusivos do usuário. Não iniciar Fase 5.


## Ampliação posterior autorizada da Fase 4

O arquivo “Markdown(4).md colado” autoriza continuar, sem reiniciar, com personalização controlada, portfólio, recusa/visualização profissional de orçamento, timeline real, recorrência, notas/tags/origem/indicação internas e preparação financeira OPCIONAL. Regras financeiras permanecem em preparação; não há gateway real, cobrança, custódia, carteira, cashback, assinatura ou financeiro completo. Entrega deve ser sempre projeto completo atualizado. Fase 5 segue não autorizada.

## Encerramento local da Fase 4

Projeto completo entregue com 270 testes locais aprovados. O relatório e a matriz da Fase 4 discriminam os limites de mocks/fixtures. Homologação real permanece PENDENTE; nenhuma publicação ou cobrança real ocorreu. Aguardar autorização de Marcelo antes da Fase 5.

## Autorização posterior — Fase 5

Marcelo aprovou a Fase 4 para continuidade e autorizou exclusivamente a Central de Atendimento Humano descrita em `scope-phase-5.md`. Não reiniciar nem reduzir segurança. Homologação externa permanece pendente; desenvolvimento local autorizado. Produção continua exclusiva de Marcelo. Não iniciar Fase 6. Nomes de operadores reais não podem ser hardcoded; usar perfis genéricos e fixtures fictícias.

## Encerramento local da Fase 5

Central de Atendimento Humano entregue com projeto completo e 323 casos locais únicos aprovados. Homologação externa permanece PENDENTE; nenhuma publicação, cobrança ou dado real. Relatório atual: `phase-5-report.md`. Fase 6 não iniciada: aguardar autorização expressa de Marcelo.

## Autorização posterior — Fase 6

Marcelo aprovou a Fase 5 e autorizou somente a Fase 6, conforme scope-phase-6.md. Não executar homologação externa agora. Não iniciar Fase 7 sem autorização expressa. Entregar projeto cumulativo completo.

## Encerramento local da Fase 6

Comercial e recuperação entregues com 391 casos locais únicos aprovados, projeto cumulativo completo e homologação externa pendente. Relatório atual: phase-6-report.md. Não houve deploy. Fase 7 não iniciada: aguardar aprovação expressa.

## Autorização posterior — Fase 7

Marcelo aprovou a Fase 6 para desenvolvimento e autorizou somente a Fase 7 conforme `scope-phase-7.md`, incluindo evolução profissional de UI/UX e correção da demo. Não executar homologação externa agora. Não iniciar Fase 8, publicar ou contratar serviços. Aprovação de desenvolvimento não conclui homologação.


## Encerramento local da Fase 7

Métricas, evolução visual e demo corrigida entregues no projeto cumulativo 2–7, com 431 casos locais únicos aprovados. Homologação externa permanece pendente e não executada. Nenhum deploy ou dado real. Relatório atual: phase-7-report.md. Fase 8 não iniciada: aguardar autorização expressa de Marcelo.


## Autorização posterior — Fase 8

Marcelo aprovou a Fase 7 e autorizou a finalização do desenvolvimento conforme scope-phase-8.md. Implementar planos/assinaturas/uso/limites e billing exclusivamente fictício, acabamento e integração das Fases 2–8. Não executar homologação externa, publicação, pagamentos reais ou produção. Não criar Fase 9. Ao concluir entregar projeto completo e parar; próxima etapa: HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO, sujeita a autorização separada.

## Encerramento local da Fase 8

Entrega cumulativa das Fases 2–8; relatório docs/phase-8-report.md. Próxima etapa somente com autorização expressa: HOMOLOGAÇÃO EXTERNA DO PRODUTO COMPLETO. Não iniciar Fase 9. Supabase real/serviços reais, piloto e produção não foram autorizados nem executados.

## Complemento posterior da Fase 8 — trial

Marcelo autorizou implementar duração/elegibilidade configuráveis, demo de 15 dias, prevenção de recadastro, registro persistente e exceções/extensões administrativas auditadas. Preservar restrições de dados fictícios, desenvolvimento local e entrega cumulativa. Verificação externa permanece pendente. Parar ao entregar o complemento; não iniciar nova fase ou publicação.

## Autorização posterior — revisão operacional e onboarding

Marcelo autorizou a revisão final pré-homologação (`docs/scope-operational-review.md`) e o onboarding guiado: Home por tarefas, agenda e ficha, operação manual, distinção de atendentes, notificações e tutorial persistido. Trata-se de complemento cumulativo das Fases 2–8, não de Fase 9. Preservar migrations 001–021; novas migrations 022–024. Sem Supabase real, deploy, dados reais ou serviços pagos. Entregar projeto completo, relatório e guia externo; parar ao concluir.

## Revisão pré-homologação — página pública

Autorização posterior para a central Página da empresa e portfólio existente, conforme `public-page-review-scope.md`. Não é nova fase. Sem homologação externa ou deploy; preservar migrations e segurança. Parar após entregar projeto cumulativo e relatório.
