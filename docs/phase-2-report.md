# Relatório da Fase 2 — Fundação

> Documento histórico da Fundação. A autorização posterior permite desenvolver a Fase 3 sem declarar homologação externa concluída. Estado atual em `docs/phase-3-report.md` e `docs/project-boundaries.md`; Fase 4 não autorizada.
**Atualização de limites de atuação:** por determinação posterior de Marcelo, o agente entrega somente o projeto com os arquivos. Deploy, produção e lançamento serão executados pelo usuário. Esta atualização documental não altera os resultados históricos dos testes nem conclui a homologação real. Ver `docs/project-boundaries.md` no pacote.

**Entrega de código concluída localmente; homologação em Supabase real pendente.** A Fase 3 não foi iniciada. A ausência de infraestrutura conectada não foi substituída por permissões permissivas ou dados fictícios na aplicação de produção.

## Ajuste de especificação incorporado

O prazo de follow-up deixa de ter qualquer regra fixa de dois dias úteis. Empresa, serviço ou regra específica poderão configurar 2h, 6h, 24h, 48h ou duração personalizada positiva. Precedência proposta: regra específica → serviço → empresa → padrão do sistema. Horário permitido de contato será tratado separadamente do intervalo. Limite de tentativas configurável, com padrão de duas no MVP; recusa/revogação encerra acompanhamento. Implementação comercial permanece fora da Fundação.

## Implementado

- Identidade individual Supabase Auth, cadastro sem concessão automática de privilégio, login, saída e recuperação/alteração de senha.
- Perfil criado por trigger do Auth. Metadados do cadastro não definem papéis ou estado administrativo.
- Criação transacional de organização com administrador inicial elegível.
- Membros administrador/colaborador, gestão de status e bloqueio de autoalteração de vínculo.
- Papéis globais `super_admin` e `atendente`, acumuláveis, geridos somente por superadmin.
- Vínculos de atendentes principal/reserva. Um principal ativo por empresa; papel global sozinho não concede acesso empresarial.
- Suspensão de pessoa, empresa, membro ou vínculo, além de verificação do banimento no Auth. Verificação server-side a cada operação; sessão antiga não garante continuidade de acesso.
- Autoalteração de papel global e autossuspensão bloqueadas. Funções de administração serializam alterações com advisory lock e revalidam acesso após obtê-lo.
- Revogar papel global de atendente suspende vínculos antigos; conceder novamente o papel não reabre empresas automaticamente.
- Auditoria de alterações, protegida contra escrita/alteração direta e leitura fora do escopo autorizado.
- Interface responsiva: entrada, criação de acesso, recuperação, nova senha, perfil, empresas, pessoas/papéis, membros, atendentes e auditoria.
- Proteção de rotas, estado explícito de backend não configurado, tratamento de erros sem expor SQL/segredos e descarte de dados visíveis ao perder acesso.
- Sem Realtime nesta fase. Contexto é revalidado em foco e a cada 15 segundos; autorização real das operações continua no banco, independentemente desse intervalo visual.
- Bloqueio de build com chave privilegiada na configuração pública; chaves administrativas não fazem parte da aplicação.

## Migrations criadas

| Arquivo | Conteúdo |
|---|---|
| `202609150001_foundation.sql` | Enums, seis tabelas, índices, integridade referencial, triggers de perfil/atualização/auditoria, privilégios e RLS/FORCE RLS. |
| `202609150002_authorization.sql` | Helpers privados que consultam identidade e vínculos reais; seis policies SELECT. |
| `202609150003_commands.sql` | Autorização de mutações, bloqueio transacional e oito RPCs com grants restritos. |

Aplicadas com sucesso no PostgreSQL WASM local. **Não aplicadas a um projeto Supabase remoto.** Todas as migrations são transacionais e devem ser aplicadas na ordem, uma única vez, com proprietário confiável em projeto dedicado.

## Tabelas e policies

| Tabela | Policy | Leitura autorizada |
|---|---|---|
| `profiles` | `profiles_read` | Próprio perfil ativo, superadmin ou administrador empresarial que compartilha vínculo apropriado. |
| `platform_roles` | `platform_roles_read` | Próprios papéis ou superadmin. |
| `organizations` | `organizations_read` | Empresas autorizadas por membro/vínculo ativo; superadmin administra todas, inclusive suspensas. |
| `organization_members` | `organization_members_read` | Próprio vínculo na empresa acessível, administrador dessa empresa ou superadmin. |
| `attendant_organizations` | `attendant_organizations_read` | Próprio vínculo acessível, administrador da empresa ou superadmin. |
| `audit_logs` | `audit_logs_read` | Administrador da respectiva empresa; superadmin também acessa eventos globais. |

Todas têm `ENABLE ROW LEVEL SECURITY` e `FORCE ROW LEVEL SECURITY`. `anon` não recebe acesso aos registros. As policies são de SELECT para `authenticated`; não há policies permissivas de INSERT/UPDATE/DELETE. As escritas diretas são revogadas e as mutações legítimas passam por funções autorizadas.

O schema `auth` pertence ao Supabase e não foi recriado no código de produção. `auth.users` foi representado por fixture somente nos testes locais.

## Funções públicas

1. `foundation_context()` — contexto autorizado do usuário.
2. `foundation_update_profile(text)` — altera apenas o próprio nome.
3. `foundation_create_organization(text,text,uuid)` — cria empresa e administrador inicial.
4. `foundation_update_organization(uuid,text,record_status)` — nome e, para superadmin, situação.
5. `foundation_set_member(uuid,uuid,member_role,record_status)` — gerencia membro empresarial.
6. `foundation_set_attendant(uuid,uuid,attendant_kind,record_status)` — gerencia vínculo de atendente.
7. `foundation_set_global_role(uuid,platform_role,boolean)` — concede/revoga papel global.
8. `foundation_set_profile_status(uuid,record_status)` — suspende/reativa perfil.

RPCs são executáveis somente pelo papel autenticado, e verificam a identidade efetiva. Helpers de mutação e triggers são privados e não podem ser executados diretamente pelo cliente. Funções SECURITY DEFINER fixam `search_path` vazio e qualificam os objetos usados.

## Testes executados

| Bateria | Resultado | Alcance real |
|---|---|---|
| TypeScript e build de produção | Aprovado | Compilação e geração do frontend. |
| SQL/RLS no PGlite 0.5.8, PostgreSQL 18.3 WASM | **68 aprovados / 0 falhas** | Execução real das migrations, roles, constraints, policies e RPCs; Auth representado por fixture. |
| Interface no Chromium/Playwright | **12 aprovados / 0 falhas** | Navegação, formulários, proteção visual, logout e suspensão; endpoints de Auth/REST simulados localmente. |
| Proteção da configuração pública | **3 aprovados / 0 falhas** | Build rejeita secret key, JWT service_role e variável privilegiada com prefixo público. |
| PostgreSQL nativo com conexões independentes | **Não executado** | Tentativa bloqueada antes dos testes: ambiente só mapeia UID 0; PostgreSQL exige usuário não-root. |

Os resultados detalhados estão em `reports/security-results.json`, `reports/browser-results.json`, `reports/config-security-results.json` e `reports/native-test-status.json`. Capturas desktop/mobile usam dados fictícios identificados como teste.

### Cenários de segurança efetivamente aprovados

- Empresa A não consulta organizações, membros, perfis, vínculos ou auditoria de B.
- Troca de UUID não libera leitura; mutação cruzada por RPC é negada.
- Atendente sem vínculo não vê empresas; colaborador e atendente não administram membros.
- Usuário não insere papéis nem altera status diretamente; metadados não concedem poder.
- Sessão anônima, sessão ausente, conta sem e-mail confirmado e pessoa suspensa não obtêm acesso operacional.
- Suspensão e revogação de papel/vínculo são verificadas mesmo com o mesmo identificador de sessão.
- Banimento do Auth também impede uso das funções.
- Criação de empresa respeita administrador elegível, slug único e nomes reservados.
- Constraint impede dois principais ativos; FK rejeita empresa inexistente.
- Auditoria identifica ator e empresa, não copia nome pessoal no payload e não admite fabricação, edição, exclusão ou truncamento pelo cliente.
- Escrita segue negada pelo RLS mesmo quando um GRANT é adicionado acidentalmente no teste.
- Todas as seis tabelas têm RLS/FORCE RLS; todas as policies e funções foram inspecionadas por consultas ao catálogo PostgreSQL.

### Limites que os testes não comprovam

O PGlite executa PostgreSQL, mas não substitui uma implantação integrada do Supabase. Não foram validadas emissão/assinatura de tokens reais, entrega de e-mail, callbacks PKCE, revogação de refresh token do serviço Auth nem limites externos de abuso. A fixture permite trocar claims para simular usuários; a validação criptográfica do JWT é responsabilidade do Auth/PostgREST real e não foi simulada como prova de segurança.

Os dois testes de concorrência nativa foram escritos, mas não executados. O bloqueio de alterações de autorização permanece no código. Confirmar em PostgreSQL/Supabase com conexões independentes que duas revogações cruzadas não removem todos os administradores e que duas atribuições simultâneas não criam dois principais.

Não há testes de agenda, orçamento, uploads ou tickets porque essas funcionalidades não pertencem à Fase 2 e não foram implementadas.

## Pendências para homologar a Fundação

1. Preparar e seguir as instruções para um projeto Supabase dedicado de testes. Quando depender de conta, credenciais ou criação/configuração que deva ser feita por Marcelo, ele executará a ação; isso não autoriza serviço pago ou deploy. Nenhuma credencial privilegiada deve ser enviada ao frontend.
2. Aplicar as três migrations com proprietário confiável, criar/confirmar a conta inicial e executar o bootstrap restrito do superadmin.
3. Configurar Site URL, redirects exatos, confirmação de e-mail, política de senha e entrega transacional; testar cadastro, confirmação, login, recuperação e logout contra Auth real.
4. Repetir cenários de isolamento via HTTP/PostgREST com contas reais de teste e tokens válidos; executar concorrência com sessões independentes.
5. Confirmar proteção de abuso no Auth e backup/restauração antes de receber usuários reais.
6. Manter as instruções de instalação, configuração, build e publicação futura preparadas para Marcelo. Publicar não é tarefa do agente nem requisito da homologação da Fundação. Não houve publicação.

Não existe decisão de negócio necessária para começar a Fase 3 neste relatório. **Existe, porém, uma aprovação de avanço obrigatória:** Marcelo pediu encerramento após a Fundação. A Fase 3 permanece parada; os itens de homologação acima também não devem ser tratados como já concluídos.


## Complemento — kit de homologação para execução pelo usuário

Preparados guia de Supabase/Auth local sem deploy, configuração de exemplo, fixture de duas empresas, inventário SQL de segurança, runner HTTP com contas reais configuradas pelo operador, roteiros de concorrência em conexões independentes e modelo de relatório. O guia também explicita e-mail, proteção contra abuso, CAPTCHA ainda não integrado e estratégia de backup/restore isolado.

Dez testes adicionais das ferramentas passaram localmente: validação de ambiente, recusa de segredos, recusa de contas repetidas/empresas iguais, proteção do relatório, parada antes de rede sem configuração e validação do SQL de fixture/inspeção em PostgreSQL WASM. Isso não amplia os 68 testes originais de RLS nem representa homologação remota.

Fonte e migrations da aplicação permanecem iguais. A execução externa e seus resultados continuam pendentes. A Fase 3 não foi iniciada.
