> Registro histórico. A autorização posterior inclui a Fase 4 e sua ampliação; estado atual em `phase-4-report.md`. Homologação real continua pendente. Não interpretar limites de fase abaixo como o estado atual do desenvolvimento.

# Relatório da Fase 3 — Empresa

Entrega de desenvolvimento: **concluída e TESTADA LOCALMENTE** em 15/09/2026. Versão do pacote: **0.3.0**. Homologação em Supabase real: **PENDENTE DE HOMOLOGAÇÃO EXTERNA**. Produção/lançamento: responsabilidade exclusiva de Marcelo. **Fase 4 não iniciada e não autorizada.**

A aprovação posterior da Fundação permitiu continuar o desenvolvimento sem apresentar sua homologação real como concluída. Essa distinção permanente está registrada em `AGENTS.md`, README, arquitetura e `docs/project-boundaries.md`. Os guias e ferramentas da Fundação permanecem no projeto.

## 1. Escopo implementado

| Área | Comportamento entregue |
|---|---|
| Cadastro empresarial | Organizações e administrador inicial continuam sendo criados pela administração da Fundação. O administrador da empresa inicia e configura somente sua organização. Cadastro de login nunca concede empresa ou papel automaticamente. |
| Configuração | Nome empresarial complementar, descrição, telefone/e-mail/endereço públicos, regiões, pagamentos, horários separados da empresa/equipe e contato interno para exceções. |
| Onboarding | Progresso e checklist calculados pelo servidor, links para resolver cada pendência e ativação humana condicionada aos requisitos atuais. |
| Serviços | Nome, categoria, descrição, URL HTTPS opcional de imagem, modalidade de preço, centavos, duração, disponibilidade, observações internas, ativo/inativo e permissões de orçamento/agendamento direto. |
| Adicionais | Pertencem a um serviço da mesma empresa; modalidades de preço, valor, duração extra e ativação. |
| Perguntas | Texto, número, escolha única ou sim/não; obrigatoriedade, ordem, opções e ativação por serviço. |
| Preços | Fixo, a partir de e sob consulta. Conversão decimal em centavos sem cálculo com frações monetárias no banco. Rejeição de combinações inválidas. |
| Manual | Onze tópicos estruturados, um rascunho por empresa, clone da versão vigente, edição, descarte explícito e publicação interna com ator/data. |
| Versionamento | Versões publicadas e suas seções são imutáveis. Cada publicação congela catálogo/adicionais/perguntas, configuração, regras, autonomia, FAQ e respostas rápidas. Atualização cria outro rascunho. |
| FAQ pública | Projeção controlada de nome, slug, versão/data e perguntas/respostas da publicação vigente. Habilitação/retirada explícitas, sem leitura anônima das tabelas privadas. |
| Respostas rápidas | Edição pela empresa; equipe consulta somente respostas do snapshot aprovado. |
| Regras | Preços, pagamento, cancelamento, remarcação, execução, prazos e encaminhamento de exceções. |
| Autonomia | Quatorze ações reconhecidas, desconto máximo e regra de nunca alterar preço. Negação por padrão; revisão explícita; contradições rejeitadas no frontend e banco. |
| Prontidão humana | Treze verificações, inclusive manual completo/atual e principal ativo/elegível. Alterações operacionais invalidam prontidão anterior e desabilitam o atendimento humano. |

Publicar um manual é uma transição de dados dentro do ambiente configurado; nenhum site foi publicado. A única interface pública da Fase 3 é a consulta da FAQ. Não foram implementados clientes, orçamentos operacionais, agenda/reservas, chat, tickets, cobrança, uploads ou automação comercial.

## 2. Migrations

As migrations originais **001, 002 e 003 permanecem byte a byte iguais**, conferidas por SHA-256 contra o manifesto da entrega anterior. Nenhuma função ou regra de autorização da Fundação foi substituída.

| Ordem | Arquivo novo | Conteúdo |
|---|---|---|
| 4 | `202609150004_company_schema.sql` | Dez tabelas, validações, constraints, FKs compostas, RLS/FORCE RLS, dez policies SELECT, auditoria e proteção de manual publicado. |
| 5 | `202609150005_company_commands.sql` | Dez RPCs públicos, autorização compartilhada com a Fundação, revisão otimista, checklist, snapshots, ativação e projeção pública da FAQ. |

**Aplicação efetiva:** todas as cinco migrations foram aplicadas a bases locais descartáveis PGlite nas baterias de teste. **Nenhuma migration foi aplicada em Supabase real nesta entrega.** Em uma instalação nova, aplicar 001 → 002 → 003 → 004 → 005. Se a Fundação já estiver aplicada, acrescentar somente 004 e 005. Não editar ou repetir migrations já aplicadas.

## 3. Tabelas e policies

Todas possuem `organization_id` obrigatório com FK, índices de chave/escopo, timestamps, RLS, FORCE RLS e auditoria por triggers. Policies permitem somente SELECT; `authenticated` recebe SELECT e os comandos permitidos passam por RPC. `anon` não recebe grants de tabela.

| Tabela | Policy | Leitura |
|---|---|---|
| `company_settings` | `company_settings_read` | Usuário ativo com acesso à empresa ativa. |
| `services` | `services_read` | Mesmo escopo empresarial. |
| `service_addons` | `service_addons_read` | Mesmo escopo; FK composta para serviço. |
| `service_intake_fields` | `service_intake_fields_read` | Mesmo escopo; FK composta para serviço. |
| `manual_versions` | `manual_versions_read` | Administrador vê rascunhos; demais vinculados veem publicações. |
| `manual_sections` | `manual_sections_read` | Mesma visibilidade da versão; FK composta. |
| `faqs` | `faqs_read` | Somente administrador empresarial ou global autorizado; equipe lê snapshot aprovado. |
| `quick_replies` | `quick_replies_read` | Mesma restrição da FAQ de edição. |
| `business_rules` | `business_rules_read` | Usuário ativo com acesso à empresa ativa. |
| `attendant_permissions` | `attendant_permissions_read` | Mesmo escopo; alteração exclusiva de administrador autorizado. |

Total do projeto: **16 tabelas públicas com RLS/FORCE RLS e 16 policies de leitura**. Não foram criadas policies de escrita nem views que contornem RLS. O índice parcial `company_one_manual_draft` impede dois rascunhos na mesma empresa. Chaves compostas impedem misturar serviços, seções e publicação vigente entre empresas.

Constraints incluem preço não negativo/inteiro, valor obrigatório em fixo/a partir de e nulo em consulta, duração válida, agendamento direto condicionado a fixo/duração, opções de perguntas válidas/distintas, dias/horários válidos, limites de texto, modalidades reconhecidas e autonomia consistente. Dois triggers protegem versões/seções publicadas; vinte triggers acrescentam atualização de timestamp e auditoria às dez tabelas.

## 4. Funções e autorização

| RPC novo | Finalidade |
|---|---|
| `company_initialize(uuid)` | Inicializa configuração, regras e autonomia negada por padrão, sem criar privilégios. |
| `company_context(uuid)` | Contexto autenticado, obedecendo RLS e visibilidade de rascunhos. |
| `company_save(uuid,text,uuid,integer,jsonb)` | Atualiza entidades explicitamente permitidas, com campos permitidos por lista, autorização e revisão esperada. Não aceita nomes de tabela/SQL arbitrários. |
| `company_create_manual(uuid,integer,text)` | Cria rascunho versionado e clona seções aprovadas quando houver. |
| `company_discard_manual(uuid,uuid,integer)` | Descarta somente rascunho da própria empresa. |
| `company_publish_manual(uuid,uuid,integer)` | Valida requisitos e congela a publicação. |
| `company_set_activation(uuid,integer,boolean,boolean)` | Confere checklist e controla atendimento humano/FAQ. |
| `company_readiness(uuid)` | Calcula os requisitos atuais sem aceitar booleano fornecido pelo cliente. |
| `company_attendant_permission(uuid,text,integer)` | Confere ação e desconto contra estado atual, papel, vínculo, empresa, prontidão e autonomia. |
| `company_public_faq(text)` | Único RPC novo concedido também a `anon`; retorna projeção pública ou `null`. |

Helpers privados: `valid_company_hours`, `valid_intake_options`, `company_audit`, `company_immutable_manual`, `company_can_read`, `company_can_manage`, `company_lock`, `company_touch`, `company_keys` e `company_checklist`. Somente helpers necessários às policies têm EXECUTE para `authenticated`; helpers de mutação não são invocáveis pelo cliente. Funções privilegiadas usam `search_path=''` e referências qualificadas.

Todas as mutações usam o mesmo advisory lock transacional **734921501** da Fundação e revalidam autorização após adquiri-lo. `revision` evita sobrescrever edição concorrente (`40001`); `operational_revision` identifica se o manual ainda corresponde à configuração aprovada. Edição de rascunho não reescreve a versão vigente. Mudanças operacionais invalidam ativação, e a permissão efetiva volta a conferir tudo no banco.

Autonomia não concede papel global nem vínculo. Colaboradores e atendentes não podem editar configuração, manual ou suas próprias permissões por formulário, RPC, campos adicionais de JSON ou escrita direta. Suspensão/revogação da Fundação continua bloqueando a próxima operação, mesmo usando as mesmas claims nos testes locais.

A fase entrega a configuração e a consulta de permissão efetiva. As futuras operações de orçamento/agenda/atendimento ainda deverão chamar a autorização correspondente dentro de sua transação; não basta confiar no resultado de uma consulta anterior. Isso faz parte das fases posteriores, não foi implementado antecipadamente.

## 5. Páginas e componentes

| Rota | Página |
|---|---|
| `/painel/:orgId/configuracao` | Informações empresariais, horários e progresso. |
| `/painel/:orgId/servicos` | Catálogo, edição de serviços, adicionais e perguntas. |
| `/painel/:orgId/manual` | Rascunho, tópicos, histórico, snapshots e publicação. |
| `/painel/:orgId/faq` | Edição de FAQ ou consulta aprovada para a equipe. |
| `/painel/:orgId/respostas` | Respostas rápidas e conteúdo aprovado. |
| `/painel/:orgId/regras` | Regras empresariais. |
| `/painel/:orgId/autonomia` | Ações permitidas, desconto e validação de contradições. |
| `/painel/:orgId/prontidao` | Checklist, habilitação humana e FAQ. |
| `/empresa/:slug/faq` | Consulta pública exclusiva da FAQ aprovada. |

As páginas da Fundação permanecem, com link para a configuração empresarial. `CompanyRoute` verifica a organização da sessão; a autorização real continua no banco.

Novos arquivos: `src/company/Company.tsx`, `model.ts` e `company.css`. Componentes: `CompanyModule`, `Configuration`, `ConfigurationForm`, `HoursEditor`, `Progress`, `RecordForm`, `Collection`, `Catalog`, `ManualEditor`, `PublishedSnapshot`, `FaqEditor`, `Replies`, `Rules`, `SingletonForm`, `Permissions`, `PermissionsForm`, `Readiness`, `PublicFaq`, `Field` e `Check`.

Interface com estados de carregamento/erro, formulários rotulados, ausência de botões de edição para consulta, confirmação explícita antes de publicação/descarte, conflito de revisão e revalidação periódica. Texto de FAQ é renderizado como texto, sem `dangerouslySetInnerHTML`. Imagens externas não são carregadas pela FAQ. Layouts de desktop e celular foram testados e inspecionados em capturas.

## 6. TESTADO LOCALMENTE

Ambiente: Node **24.19.0**, PostgreSQL **18.3 via PGlite 0.5.8/WASM**, Chromium/Playwright, React/TypeScript/Vite conforme lockfile. As identidades e o serviço Auth usados nos testes são simulados. Não houve uso de dados reais de clientes ou conexão ao banco da MS.

Comando completo: `npm run test:local`, com `FOUNDATION_CHROMIUM_PATH` apontando para o Chromium local de testes. Resultado final: **exit code 0**.

| Bateria | Resultado final | Evidência |
|---|---|---|
| Regressão da Fundação com todas as migrations | **68 PASS / 0 FAIL** | `reports/security-results.json` |
| Segurança e domínio da Empresa | **71 PASS / 0 FAIL** | `reports/company-security-results.json` |
| Navegador: Fundação | **12 PASS / 0 FAIL** | `reports/browser-results.json` |
| Navegador: Empresa integrada a SQL local | **13 PASS / 0 FAIL** | `reports/browser-results.json` |
| Ferramentas de homologação da Fundação | **10 PASS / 0 FAIL** | Saída consolidada; `reports/homologation-tooling.tap` |
| Ferramentas da Empresa e dinheiro | **5 PASS / 0 FAIL** | Saída consolidada; `reports/company-tooling.tap` |
| Rejeição de configuração privilegiada no build | **3 PASS / 0 FAIL** | `reports/config-security-results.json` |
| TypeScript e build | **PASS** | `reports/phase-3-local-validation.txt` |
| Inspeção do bundle e hashes da Fundação | **PASS** | `reports/company-bundle-scan.json` |

**Total: 182 testes automatizados aprovados, sem falhas, ignorados ou testes instáveis no resultado final.** Typecheck, build e inspeção são verificações adicionais, não somados aos 182. A matriz com cada nome e resultado está em `docs/phase-3-test-matrix.md`.

A ponte `tests/support/company-browser-db.ts` executa os RPCs reais das migrations no PostgreSQL WASM para os treze testes de interface da Empresa. Ela simula o transporte HTTP e a autenticação, serializa as operações locais e não é incluída no frontend. Portanto comprova o caminho formulário → parâmetros → SQL → resposta local, **sem comprovar GoTrue, PostgREST real, assinatura JWT ou concorrência entre conexões**.

Os casos de segurança incluem isolamento nas dez tabelas, escrita direta/GRANT acidental, elevação de papel via metadata, edição de outra empresa por ID, FK composta, preço/horários/opções inválidos, contradições de autonomia, limite de desconto, revisão obsoleta, manual incompleto, imutabilidade, clone/descarte, snapshots públicos, retirada de FAQ, ativação sem vínculo, suspensão de perfil/empresa/membro/atendente/papel, auditoria e inventário de grants/policies/search_path.

## 7. Falhas encontradas e correções

- Uma fixture de revogação tentou remover o último administrador empresarial. A Fundação corretamente recusou; o teste passou a cadastrar outro administrador elegível antes de revogar o alvo. Nenhuma regra de segurança foi relaxada.
- A contagem inicial esperada dos RPCs Empresa estava incorreta (11 em vez de 10); ajustada à assinatura efetivamente implementada e mantida a verificação individual de exposição anônima.
- Corrigida uma sintaxe JSX durante o primeiro build e tornados explícitos os rótulos acessíveis dos campos, evitando seleção ambígua de textarea com conteúdo.
- Corrigido o seletor de navegador que confundia o título de um tópico com o rótulo do formulário. O caso de publicação incompleta passou contra SQL local.
- Ajustados os campos de horário no celular para acomodar o seletor nativo sem comprimir os controles.
- A verificação original de quantidade de tabelas/policies passou de 6 para 16, ampliando o gate às tabelas da nova fase. Os testes originais de acesso continuam passando.

O build apresentou aviso de tamanho de chunk (aproximadamente **529 kB**, **151 kB gzip** de JavaScript). O build e o typecheck passaram; divisão de bundle é uma otimização futura, não houve aumento artificial do limite para ocultar o aviso.

## 8. PENDENTE DE HOMOLOGAÇÃO EXTERNA

| Validação | Por que permanece pendente | Preparação entregue |
|---|---|---|
| Aplicação em Supabase real | Projeto/credenciais dedicados não configurados pelo usuário. | Migrations, `.env.example`, guia e inventário SQL. |
| Cadastro/confirmação/login/logout/recuperação reais | Dependem de Auth real, SMTP, redirects e caixas de teste. | Kit original da Fundação preservado. |
| RLS via HTTP/PostgREST e JWT válido | Transporte/claims dos testes locais são simulados. | `company-http.mjs`, comandos npm e roteiro manual complementar. |
| Suspensão/revogação em sessão real | Mesmas claims foram testadas localmente; emissão/validação de token real não. | Runner Empresa reutiliza token original para revogar autonomia; repetir Fundação para demais suspensões. |
| Concorrência com conexões independentes | `npm run test:native` foi tentado e retornou 2: o contêiner só mapeia UID 0; PostgreSQL exige usuário não-root. Não houve bypass. | Scripts A/B, checagem de PIDs/revisão e roteiro de publicação/revogação concorrentes. |
| Abuso, rate limits, CAPTCHA e provedor | Dependem de configuração externa. CAPTCHA ainda não está integrado no frontend. | Guia orienta registrar bloqueio se exigido, sem desativar proteção existente. |
| Chaves após configuração real | Bundle local foi inspecionado; credenciais finais ainda não existem. | Guardas de build, exemplos e checklist de nova inspeção. |
| Backup/restauração | Origem e destino seguro de restauração não configurados. | Estratégia original ampliada às 16 tabelas, snapshots e autorização. |

O runner HTTP da Empresa foi preparado, checado sintaticamente e testado quanto à recusa sem configuração. **Não foi executado contra Supabase real**, nem deve ser descrito como tal. Os testes de concorrência preparados não foram executados com dois backends nativos.

## 9. Decisões de implementação e limites

- Negação por padrão da autonomia; revisão explícita pela administração empresarial. Desconto entre 0 e 100%, com limite positivo somente quando permitido. “Nunca alterar preço” veta desconto e negociação.
- Alterações operacionais exigem republicação e reativação humana; revisão de conteúdo ainda em rascunho preserva a versão aprovada.
- Publicação requer manual/configuração completos; não exige principal ativo. Ativação humana exige principal ativo/elegível. A FAQ aprovada pode ser habilitada sem esse vínculo e o catálogo pode ser configurado desde o início.
- Checklist verifica preenchimento e consistência objetiva, não julga a qualidade comercial do texto; a revisão de conteúdo permanece responsabilidade da empresa.
- Um fuso (`America/Recife`, preservado da Fundação) e uma faixa de horário por dia, sem expediente atravessando meia-noite. Agenda, feriados, recursos e capacidade pertencem à fase apropriada.
- Valores são inteiros em centavos; teto de R$ 1.000.000,00 por serviço/adicional e duração máxima de 10.080 minutos. Perguntas simples, sem construtor genérico; escolha com 2–20 opções distintas.
- Serviços, perguntas, FAQ e respostas podem ser inativados; publicações passadas e auditoria não são reescritas. Discard de rascunho é explícito.
- Imagem opcional é URL HTTPS configurável. Upload, processamento de imagem e Storage permanecem fora desta fase.
- Limites de recuperação/follow-up configuráveis permanecem especificados para a Fase Comercial; não foi implementado prazo fixo de dois dias nem automação nesta entrega.
- A interface de configuração carrega o catálogo e histórico do escopo empresarial; paginação de catálogos/históricos muito extensos é uma evolução de escala, não validada por carga nesta fase.

Não há decisão pendente que impeça entregar o desenvolvimento da Fase 3. Homologação externa, eventuais ajustes de provedor e aprovação de novas fases continuam separados. Qualquer conclusão de homologação real exige evidências do ambiente real.

## 10. Entrega e encerramento

Projeto portátil com código, cinco migrations ordenadas, exemplos de configuração, testes, scripts, documentação e resultados. Guias: `docs/homologation-guide.md` e `docs/phase-3-homologation.md`. Relatório externo a preencher: `docs/phase-3-external-report-template.md`.

**Fase 3 concluída para revisão do desenvolvimento. Homologação externa pendente. Nenhum deploy, contratação, domínio, publicação da aplicação ou uso de clientes reais. Parar e aguardar aprovação antes da Fase 4.**
