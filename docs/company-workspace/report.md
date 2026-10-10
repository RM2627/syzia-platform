# Relatório — Minhas empresas, ambiente empresarial e onboarding

Data: 20/09/2026. Correção pontual sobre o ZIP completo com migrations 001–027. Esta entrega acrescenta somente a migration 028. Não inicia nova fase.

## Resultado

O clique principal na empresa e os links **Abrir empresa** agora entram em `/painel/:orgId`. O Super Admin recebe a experiência empresarial existente, mesmo sem administrador, com primeiro acesso pendente ou após ativação do administrador. **Definir administrador** permanece uma ação separada, no fluxo de provisionamento existente em `/painel/:orgId/acessos`. **Pessoas e acessos** continua sendo a entrada explícita para gestão de usuários.

Configuração incompleta mostra o checklist existente. Configuração completa mostra a Home normal, com opção de revisar o checklist. O tour continua opcional e separado por usuário e empresa. Um cabeçalho identifica a empresa atual, o papel Super Admin e os caminhos para **Administração VIRELOQ** e **Minhas empresas**.

Empresas suspensas continuam sem operação empresarial; o cadastro global permite reativação. Nenhum administrador ou vínculo é criado ao abrir uma empresa.

## Causa-raiz confirmada

1. `CompanyRoute` devolvia `OrgPage` tanto para a rota principal quanto para `/acessos` quando o usuário era Super Admin. `OrgPage` contém a gestão de acessos e a preparação do primeiro administrador.
2. `Shell` montava `CompanyExperience` somente quando havia membership ativo de `admin_empresa`. O Super Admin sem vínculo não recebia checklist, tour ou navegação empresarial.
3. Os links no registro de empresas e nas instruções de acesso usavam `/acessos` mesmo quando o rótulo era **Abrir empresa**. Após criar empresa sem ADM, havia uma ação combinando abertura e definição do administrador.
4. A migration 022 havia deliberadamente restringido os helpers de configuração e operação ao vínculo empresarial. Onboarding, Home e outras consultas verificavam `is_org_admin` diretamente. Portanto, corrigir apenas as rotas deixaria o banco recusando o acesso.

## Alterações de frontend

- `src/FoundationApp.tsx`: distinção entre autorização global e membership; montagem do `CompanyExperience` existente para o Super Admin; rota principal abre `Operations`; identificação e retorno explícitos.
- `src/access/OrganizationAdmin.tsx`: nome e Abrir empresa levam ao painel; Definir administrador continua separado. Uma preparação interrompida é chamada **Continuar definição do administrador**, evitando confundir acesso com configuração empresarial.
- `src/access/EnterpriseAccess.tsx`: correção do destino Abrir empresa e separação dos dois links após criação sem ADM.
- `src/brand/vireloq.css`: apresentação responsiva do contexto da organização; branding existente preservado.

O arquivo `src/operations/Onboarding.tsx` permanece byte a byte igual. Dados, identidade, catálogo, preços/adicionais, horários, disponibilidade, regiões, portfólio, página, regras e demais módulos continuam nas mesmas implementações. Empresas sem configurações inicializadas reutilizam o botão **Iniciar configuração** que já existia.

## Autorização e migration 028

Arquivo: `supabase/migrations/202609200028_company_workspace_authorization.sql`.

`private.is_org_admin` continua significando administrador com vínculo empresarial. A 028 atualiza `company_can_manage` e `company_can_read` para reconhecer também o papel global ativo armazenado no banco, com sessão/perfil/Auth válidos, escopo da sessão e organização ativa. Não confia em metadata do token para conceder papel.

Nove RPCs existentes passam a usar a autorização empresarial comum: `onboarding_context`, `operations_agenda`, `operations_detail`, `operations_directory`, `operations_requests`, `operations_home`, `operations_quote_context`, `analytics_company` e `analytics_central`. Seus corpos funcionais são preservados, com troca do predicado de autorização. As consultas de métricas passam a acompanhar a autorização de gestão global explicitamente solicitada; atendentes continuam sem essa permissão.

Quatro policies SELECT são ajustadas: `organization_user_guides_read`, `appointment_events_read`, `notifications_read` e `notification_reads_read`. Guia e notificações lidas continuam limitados ao próprio usuário. As demais policies reutilizam os helpers existentes.

Preservados: RLS/FORCE RLS, recusa de escrita direta, constraints, locks, controle de revisão, assinatura das RPCs, auditoria com ator real, trial e aceite legal. Não há tabela nova, alteração de linhas no upgrade, novo membership, usuário artificial ou reset. Funções antigas privadas continuam sem acesso pelo cliente. Empresa A continua sem acesso a B.

A nova permissão atende à autorização expressa desta solicitação e substitui a restrição histórica ao Super Admin no ambiente empresarial. Testes antigos que negavam esse acesso global foram ajustados; as recusas a usuários empresariais, atendentes e consumidores foram mantidas e a cobertura global foi adicionada.

## Integridade e preservação

- Migrations 001–027 comparadas por SHA-256: **27 de 27 idênticas**.
- Lockfile, dependências declaradas e exemplos de ambiente preservados; somente scripts de teste foram acrescentados ao `package.json`.
- Onboarding existente preservado, incluindo o cálculo dos itens e a persistência do tutorial.
- Upgrade testado sobre base na 027 com progresso previamente gravado. Organizações, memberships, configurações, guias, contagem de auditoria/trial e flags de RLS permaneceram iguais após a migration.
- Nenhum arquivo da entrega-base omitido. O manifesto do ZIP registra os hashes dos arquivos finais; o inventário de alterações fica em `reports/company-workspace/consolidation.json`.

## Validação local

| Verificação | Resultado |
|---|---:|
| Testes novos SQL, incluindo upgrade 027→028 | 20 aprovados |
| Demo completa no navegador, incluindo 5 novas jornadas A–I | 57 aprovados |
| Interface dos módulos existentes | 43 aprovados |
| Comandos de regressão de banco/backend/segurança | 18 concluídos sem falha |
| TypeScript, build e varredura do bundle com marcador server-only | Aprovados |
| Integridade das migrations históricas | 27 de 27 preservadas |

Os 18 comandos incluem Fundação, empresa, onboarding, operação, página/portfólio, acesso/ativação, consumidor, preparação financeira, Central, Comercial, Analytics, billing/trial, imagens, configuração e multissegmento. Comandos não foram somados como casos; a rodada focada inicial dos cinco testes de navegador não foi contada novamente. A suíte final de navegador não apresentou falha, teste pulado ou aprovação por retry.

A matriz A–I é exercitada pelos testes SQL e pela jornada real da interface da demo em desktop e celular. Inclui salvamento e recarregamento de configuração, primeiro acesso pendente/ativo, retorno global, ausência de formulário de provisionamento na Home, bloqueio entre empresas, revogação global, suspensão e expiração de sessão. A conferência visual das capturas confirmou identificação da empresa e layout sem transbordamento.

Os testes SQL utilizam PGlite/PostgreSQL WASM com fixtures de Auth. Os testes de navegador utilizam Chromium, a demo HTTP local e adapters controlados. Não equivalem a Supabase real.

Ocorrências durante a preparação: o harness SQL genérico não aceitava o nome `company_save`; os testes passaram a invocar essa RPC diretamente via SQL. O caso de empresa nova passou a usar `company_initialize`, como o botão já existente na interface. Corrigidos também argumentos/identidade do harness. A primeira tentativa de iniciar a demo encontrou a dependência local `nodemailer` ausente no diretório de dependências reaproveitado; a execução foi feita com as dependências da entrega 027. Nenhum desses ajustes reduziu validações do produto. Resultados finais e logs estão no pacote.

## Atualização e pendências

Com 001–027 já aplicadas: preserve suas configurações locais, extraia o ZIP completo, aplique somente 028, execute `npm ci` e `npm run build`, reinicie os processos locais e valide o Super Admin existente. Passo a passo: `docs/company-workspace/upgrade.md`.

Supabase Auth/PostgREST/Storage/SMTP reais e concorrência com PostgreSQL nativo não foram executados nesta tarefa. A homologação externa permanece pendente; roteiro em `docs/company-workspace/external-homologation.md`. Não houve deploy, envio real de e-mail, contratação, acesso a dados reais ou inclusão/recriação de `.env` e `.env.server` preenchidos. O vídeo permanece **CANCELADO**.
