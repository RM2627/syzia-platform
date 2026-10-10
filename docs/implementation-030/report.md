# VIRELOQ — Relatório técnico da implementação 030

Data: 21/09/2026. Base: consolidado 029 fornecido. Entrega cumulativa para homologação do proprietário; nenhum deploy ou serviço real foi utilizado.

## O que mudou

**Financeiro empresarial.** Novo módulo integrado à empresa com Visão geral, Contas a receber, Recebimentos, Despesas, Caixa e Calculadoras. O billing da própria VIRELOQ permanece separado. Conta manual aceita vínculos de cliente/serviço/agendamento e responsável. Nova aprovação de orçamento com total positivo gera uma conta, sem registrar pagamento. A Central e a ficha do agendamento podem abrir a cobrança autorizada.

Recebimentos permitem sinal, parcial e múltiplos lançamentos. O saldo deriva dos registros válidos. Estorno restrito ao ADM/gestão global autorizada conserva o original e registra motivo, ator, data e efeito. Correção é estorno integral seguido de novo lançamento explícito, quando necessário. Conta recebida não pode ser cancelada sem desfazer os recebimentos. Despesas têm categoria configurável, data, forma, observação e cancelamento auditado.

Calculadoras de preço por margem, resultado bruto/margem, desconto e meta trabalham somente em memória. Não criam propostas, contas, recebimentos ou despesas.

**Métricas.** A aba existente inclui os indicadores financeiros, com definição e período visíveis. Orçado, aprovado, realizado e recebido são fatos distintos. Resultado é entradas menos despesas, sem alegação de lucro contábil. A média exibida é por recebimento. Saldos a receber/vencidos são a posição atual. As fontes e limitações estão em `metrics.md`.

**Permissões em toda a plataforma.** Pessoas e acessos passa a configurar ações e escopos explicitamente. O teto do papel, capacidade contratada, status, sessão, organização e grant são avaliados no servidor. Rotas, menus e controles acompanham essa decisão. Acesso à cobrança individual não libera totais. Atendentes mantêm as autonomias existentes da Central. ADM pode configurar os compartilhados já atribuídos, dentro do teto; atribuição permanece global e condicionada ao plano.

**Categorias.** Entidade por organização, com criação, reutilização, renomeação, ordem, desativação e exclusão segura. Backfill deduplica os textos anteriores e mantém vínculo e compatibilidade. Categoria em uso não é apagada.

**Capacidades e condição comercial.** Planos/versões existentes recebem capacidades explícitas. A ausência de atendimento compartilhado bloqueia atribuição inclusive pelo Super Admin; perda da capacidade suspende vínculos e preserva histórico. Empresa interna/isenta é concessão global auditada com capacidades selecionadas, fora do trial/assinatura. Ausência de ADM não concede isenção.

**Primeiro acesso.** Depois da senha e aceite legal, o novo ADM conclui CPF/CNPJ quando exigido. A verificação normal usa estrutura/dígitos e histórico interno. Documento completo não é persistido: ficam hash privado e máscara. Histórico de trial usado não impede contratar. Revisão manual é excepcional. Cadastros legados preservam operação; não foi imposta migração cadastral em massa.

**Sessão e preservações.** Super Admin continua configurando organização sem ADM responsável, sem membership artificial. A 029 continua exigindo suporte autorizado/emergência quando há ADM responsável. Sessão global revalidada permanece global. Empresa suspensa recebe mensagem própria; o erro genérico não atribui falsamente falta de confirmação de e-mail. Rascunhos sobrevivem à revalidação de permissões sem alteração efetiva. Exclusão conservadora continua possível para empresa realmente vazia; documento, revisão, concessões e histórico impedem exclusão.

## Implementação

A única nova migration é `202609210030_business_finance_permissions.sql`, transacional e incremental. As 29 migrations anteriores foram comparadas por SHA-256 com a base e permanecem idênticas. A montagem reprodutível da 030 está em `scripts/implementation-030` e `scripts/build-030.mjs`; o arquivo SQL consolidado é o artefato aplicável.

Foram reutilizados Auth empresarial, memberships/vínculos, onboarding, códigos, permissões/autonomias da Central, agenda, propostas, trial, planos, billing, suporte 029, branding e auditoria. Nenhum modelo paralelo de onboarding, identidade, planos ou conversa foi criado.

Regras de autorização envolvem as RPCs antigas por ação explícita e restringem os aliases internos. RLS/FORCE RLS e foreign keys por organização protegem leitura e vínculos. A matriz exata de ações está em `permission-catalog.json`/`permissions.md`, e o mapeamento dos wrappers em `rpc-permissions.json`. RPCs de composição, operações globais e helpers do gateway recebem tratamento específico documentado no código da 030.

## Validação e limites

Resultados finais: 30 testes backend, 5 de calculadoras, 32 suítes de regressão e 107 casos únicos de navegador aprovados após os retestes documentados. O upgrade preservou inclusive progresso de onboarding e histórico de trial preenchidos. Comandos e execuções intermediárias: `tests.md` e `reports/implementation-030`. Testes locais utilizam SQL real em PGlite, Auth/transportes fictícios e Chromium. Isso não é homologação de Supabase real.

A tentativa de PostgreSQL nativo não executou os testes de corrida: o contêiner não permite o usuário Linux não root exigido pelo servidor. O runner e oito casos com conexões separadas acompanham a entrega para execução em ambiente compatível. Idempotência sequencial e testes HTTP não substituem essa pendência.

Não houve Supabase real, SMTP real, Storage real, gateway novo, cobrança, importação de dados reais ou produção. O aceite final depende da homologação do proprietário, incluindo as pendências de `pending.md`.

## Arquivos de referência

| Entregável | Arquivo no projeto |
|---|---|
| Pedido integral | `docs/implementation-030/request.md` |
| Relatório técnico | `docs/implementation-030/report.md` |
| Matriz de permissões | `docs/implementation-030/permissions.md` |
| Capacidades dos planos | `docs/implementation-030/capabilities.md` |
| Definições de métricas | `docs/implementation-030/metrics.md` |
| Segurança/RLS | `docs/implementation-030/security.md` |
| Testes e resultados | `docs/implementation-030/tests.md` |
| Upgrade testado | `reports/implementation-030/upgrade.json` |
| Atualização sem reset | `docs/implementation-030/upgrade.md` |
| Pendências e decisões | `docs/implementation-030/pending.md` |
| Integridade do pacote | `MANIFEST.json` |

Referência técnica do formato CNPJ: [Receita Federal — perguntas e respostas](https://www.gov.br/receitafederal/pt-br/centrais-de-conteudo/publicacoes/perguntas-e-respostas/cnpj/cnpj-alfanumerico.pdf). O algoritmo usa módulo 11 e conversão ASCII menos 48 para letras, preservando o formato numérico. Essa referência orienta apenas a validação estrutural, sem consulta oficial de documentos.

Após a entrega, parar e aguardar a homologação do proprietário. Não iniciar nova fase, implantação ou produção.
