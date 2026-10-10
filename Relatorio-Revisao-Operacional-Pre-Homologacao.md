# Revisão operacional pré-homologação e onboarding

**Entrega cumulativa das Fases 2–8 + trial. Desenvolvimento e testes locais. PENDENTE DE HOMOLOGAÇÃO EXTERNA.**

Não houve Fase 9, deploy, publicação, contratação de serviço, pagamento real, conexão com Supabase real nem utilização de dados de clientes. A empresa MS Auto Details desta demonstração é exclusivamente fictícia.

## O que foi implementado

A entrada do gestor passou a priorizar **“O que precisa ser feito hoje?”**, com agenda do dia, próximo compromisso, amanhã, decisões pendentes, pedidos que exigem ação e atualizações internas. A navegação separa operação, análise e configuração.

A Agenda apresenta dia, semana e calendário, utiliza as reservas e o recurso únicos existentes e permite bloqueios. A ficha reúne cliente, contato, itens, proposta relacionada, aprovação registrada quando existente, respostas, observações, origem e histórico. Ações de iniciar, finalizar, cancelar e reagendar validam autorização atual, estado, revisão e transação; remarcação malsucedida preserva a reserva anterior. Conclusão é um evento operacional, **não receita**.

O fluxo manual permite criar/selecionar cliente, escolher serviço/adicionais, registrar respostas, origem e horário. Os cálculos são refeitos no banco; a duração não pode ser manipulada para reservar menos tempo que o previsto. O mesmo telefone não autentica ou mescla pessoas. Consentimento operacional não concede marketing. Não foram criadas entidades paralelas de clientes, oportunidades, orçamentos ou agenda.

Atendente próprio é um vínculo explícito da empresa, sem poderes de gestão. Modalidades própria, compartilhada e mista reutilizam responsabilidade única, transferência, prontidão e autonomia da Central. Alterar modalidade desativa atendimento até nova revisão. Superadmin mantém administração legítima de empresas/planos/trial, mas não recebe clientes ou métricas privadas simplesmente pelo papel global. Atendentes também não recebem indicadores gerenciais.

Notificações internas de agendamento, mudança de horário, cancelamento, início/conclusão e decisão abrem o objeto relacionado; a leitura é individual. A auditoria não encontrou uma tabela `notifications` preexistente nas migrations 001–021; foi criada uma única estrutura, sem duplicar um sistema anterior.

## Onboarding e tutorial

- Checklist calculada no servidor a partir dos registros da organização: dados, identidade, serviços, preços, horários, agenda, portfólio, página e publicação. Recomendações opcionais não viram exigências fictícias.
- Manual, FAQ, regras, autonomia e prontidão entram na checklist após optar por atendimento compartilhado/misto ou quando esse atendimento já está ativo.
- Cada item leva à tela/seção correspondente; logo/capa/portfólio e horários têm âncoras de navegação.
- Tour opcional com cinco passos: Home, Agenda, Pendências, Atendimento e Métricas. Controles **Pular, Anterior, Próximo e Concluir**.
- Estado persistido por **usuário + organização**. Retomada, conclusão, pular e refazer pela Ajuda não dependem de armazenamento temporário do navegador.
- Controle de revisão impede duas abas de sobrescrever o progresso; comandos repetidos com a mesma chave são idempotentes.
- Ajuda contextual em Manual, Autonomia, Comercial, Atendimento, Prontidão e Métricas.

## Banco, segurança e arquivos

Novas migrations:

1. `202609180022_operational_authorization.sql`
2. `202609180023_daily_operations.sql`
3. `202609180024_company_onboarding.sql`

**As 21 anteriores são idênticas byte a byte ao pacote anterior.** Prova: `reports/operations-migration-preservation.json`.

Quatro tabelas novas: `appointment_events`, `notifications`, `notification_reads`, `organization_user_guides`. Todas com RLS, FORCE RLS, SELECT autorizado, nenhuma policy cliente de escrita, constraints e auditoria. O inventário cumulativo confirma **67 tabelas públicas e 67 policies SELECT**. A exclusão temporal e as proteções originais da agenda foram preservadas.

RPCs, helpers, colunas, constraints, policies, componentes e rotas estão descritos em `docs/operations-sql-inventory.md`; catálogo extraído do banco em `reports/operations-sql-catalog.json`. A matriz de tarefas está em `docs/company-daily-journey-matrix.md`.

Principais componentes novos: `src/operations/Onboarding.tsx`, `Operations.tsx` e `operations.css`. Integrações em FoundationApp, Company, Central, Consumer/PresenceAdmin e Analytics. Rotas empresariais incluem Home, Agenda/ficha, Clientes, Orçamentos, criação manual, Atendimento, Ajuda e Acessos.

## TESTADO LOCALMENTE

Os resultados individualizados são a fonte de evidência. Auth local utiliza fixtures/claims simuladas; a demo utiliza HTTP em localhost com cliente Supabase e SQL/PGlite, sem Supabase externo.

| Suíte SQL principal | Casos aprovados |
|---|---:|
| Fundação/segurança | 68 |
| Empresa | 71 |
| Consumidor | 35 |
| Presença, imagens empresariais e preparação de pagamentos | 28 |
| Central | 40 |
| Comercial | 54 |
| Billing fictício | 50 |
| Trial/elegibilidade | 42 |
| Analytics | 27 |
| Onboarding | 13 |
| Operação diária | 16 |
| **Total dessas suítes** | **444** |

Também foram executados os testes de upgrades, ferramentas de homologação, imagens, provider fictício, configuração, demo HTTP, TypeScript/build e scanner do bundle. Os relatórios correspondentes permanecem em `reports/`.

A regressão de interface aprovou **54 testes** (`reports/browser-results.json`). A demo completa aprovou **18 cenários** (`reports/operations-demo-regression.json`), incluindo público A/B em desktop/tablet/celular, atendimento, orçamento/aprovação/agenda, métricas, planos/trial e onboarding desktop/mobile. O cenário adicional da operação manual também passou (`reports/demo-browser-results.json`): cadastro, agendamento, remarcação, cancelamento, bloqueio e visão semanal. Total: **73 testes de navegador aprovados**, sem contabilizar repetições. Resumo em `reports/operations-summary.json`.

Cobertura específica: primeira entrada, persistência real, retomada, pular/concluir/refazer, duas abas, separação por usuário/empresa, escrita direta negada, revogação com sessão anterior, cálculo e duração no servidor, conflito de agenda/bloqueio, preservação de remarcação, transições inválidas, conclusão idempotente, histórico, métricas sem receita, notificações, vínculo próprio e restrição de superadmin.

Inspeção visual realizada nas capturas de Home, checklist e ficha, com correção do layout desktop. Evidências em `reports/visual-operations/`, além das capturas cumulativas anteriores. Não houve teste em aparelho físico ou certificação formal de acessibilidade.

## Falhas encontradas e correções

- Entrada empresarial priorizava administração de vínculos: substituída pela Home operacional; vínculos ficam em Acessos.
- Restrição ao superadmin afetou também consultas legítimas de billing/trial: separada autorização de billing da gestão comercial privada; regressão repetida.
- Testes antigos concediam Analytics ao atendente: atualizados para exigir negação, preservando prova de elegibilidade da Central pelos mecanismos próprios.
- Inventários esperavam 63 tabelas: atualizados para 67, sem remover verificação de RLS/FORCE RLS ou aceitar escrita direta.
- Rota estática de assinatura não fornecia parâmetro `section` e caía na Home: resolução da seção corrigida e assinatura/trial revalidados.
- Menu empresarial herdava direção vertical no desktop: estilo corrigido e captura reinspecionada.
- Links de configuração apontavam rota/seção inadequada: corrigidos; dados carregados de forma assíncrona recebem foco de navegação por âncora.
- Contexto de orçamento passou a validar organização explícita mesmo para gestor com vínculo em duas empresas.
- Promoção de atendente próprio poderia conflitar com a constraint: comando atômico e limpeza da marca na promoção.
- Duração manual reduzida indevidamente: rejeitada no servidor.
- Mocks de testes de interface não conheciam os novos RPCs e produziam alertas espúrios: adaptadores locais atualizados; não houve relaxamento das regras do produto.

Tentativas intermediárias permanecem identificadas em `reports/archive-operational-attempts/`. A execução agregadora local precisou ser encerrada depois que os relatórios de determinadas suítes já haviam sido gravados; as suítes restantes foram executadas separadamente. Não se afirma que um único processo `test:local` terminou integralmente; os resultados finais por suíte estão no resumo.

## Limitações conhecidas e decisões

1. **Publicação ainda depende do modelo aprovado de manual/versionamento das fases anteriores.** Mesmo sem atendimento compartilhado, publicar a página exige um snapshot aprovado originado nesse modelo. A interface informa a dependência e leva à revisão; a checklist não finge que a página está pronta. Desacoplar completamente publicação comercial de manual interno exige uma decisão de produto/arquitetura adicional, não foi feito silenciosamente nesta revisão.
2. Agenda conserva um recurso ativo e timezone permitido pela arquitetura atual (`America/Recife`). Consulta de até 42 dias e 1.000 compromissos; diretórios usam páginas de 50 registros. Não houve dimensionamento com carga real.
3. Reservas existentes já são confirmadas; não foi inventado um estado ou contador de “aguardando confirmação”. Pedidos de decisão/reagendamento passam pelo contexto existente do atendimento.
4. Proposta manual não simula aprovação do consumidor. Ficha distingue referência comercial de valor efetivamente aprovado.
5. Demo tem cadastros/estados históricos deliberadamente fictícios. Reiniciar `dev:demo` reconstrói a massa; ela não é autenticação ou banco de produção.

## PENDENTE DE HOMOLOGAÇÃO EXTERNA

Auth real, confirmação/recuperação de e-mail, PostgREST/RLS com tokens reais, Storage/URLs temporárias, expiração/revogação externa, SMTP, proteção contra abuso, capacidade e backup/restauração continuam pendentes conforme guias anteriores.

O teste com PostgreSQL nativo e conexões independentes **não iniciou**: o ambiente não permite mapear usuário sem privilégios para executar o servidor. O script `npm run test:operations:native` foi entregue, com disputa de reserva, idempotência e concorrência do tutorial, mas esses cenários não foram declarados aprovados. A constraint foi testada sequencialmente em SQL local; isso não equivale a concorrência real.

Guia específico: `docs/operational-homologation.md`. Runner somente leitura preparado: `scripts/homologation/operations-http.mjs`. Seu preflight local recusou configuração ausente **sem abrir conexão externa**, como esperado.

**O produto não pode ser considerado homologado externamente ou liberado para produção por esta entrega.** O pacote é o projeto completo para revisão, reconstrução e futura homologação por Marcelo. Nenhuma nova fase ou publicação será iniciada automaticamente.
