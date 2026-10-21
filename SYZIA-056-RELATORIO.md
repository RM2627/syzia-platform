# SYZIA 056 — Simplificação comercial e verificação da ativação

Data: 21/10/2026. Base consultada pelo GitHub conectado e obtida diretamente do repositório `RM2627/syzia-platform`: `main` em `ba6546816a0dc1cf1fb6e9333851974b6fea1674`. Não havia commits posteriores na consulta inicial. Branch local: `syzia-056-commercial-ux`, sem commit, push, merge ou deploy. Nenhum ZIP anterior foi usado como base.

## Resultado

A simplificação comercial está implementada e validada localmente. A ativação foi verificada de forma direcionada, com uma limitação estrutural anterior identificada e preservada para decisão específica. Esta entrega **não declara homologação integral da ativação, do Mercado Pago ou do gate histórico**.

### Alterações entregues

- Pré-cadastro exige somente **Nome do interessado ou da empresa** (2–120 caracteres). E-mail opcional; empresa, segmento, Instagram, WhatsApp, data do primeiro contato, etapa e observações ficam em informações complementares. Nome/empresa podem ser detalhados posteriormente.
- Nome da empresa, e-mail, interesse e data de primeiro contato desconhecidos permanecem nulos no cadastro administrativo. Nenhum consentimento, interesse, conversa, endereço eletrônico ou data de contato é inventado.
- O formulário público de interessados conserva suas exigências anteriores de empresa, e-mail e interesse. WhatsApp continua opcional onde já era opcional.
- Vínculos N:N existentes passam a aparecer em Convites mesmo quando o contato ainda não pode receber convites. Vincular **não emite token nem envia e-mail**.
- Dados ausentes e bloqueios são mostrados na própria lista. O e-mail pode ser completado ali, sem repetir o pré-cadastro. A autorização verdadeira, específica e com validade é registrada na preparação do convite, usando os controles existentes; não é exigida para cadastrar o interessado.
- Seleção individual, múltipla e de todos os elegíveis do filtro. A seleção geral conta endereços únicos; evita selecionar dois vínculos com o mesmo destinatário no mesmo lote. Alterar filtro/finalidade limpa a seleção.
- Geração de link individual para demonstração **ou** ativação, sem disparar e-mail. Reutiliza o controlador existente, tokens individuais, versão publicada, validade, revogação, confirmação do lote, limites, supressão e prevenção de reenvio.
- Corrigida a remoção de destinatário na prévia: agora mantém a chave `demo_id:lead_id` esperada pela seleção. A implementação anterior usava apenas `demo_id` e não encontrava o vínculo.
- Histórico identifica o interessado mesmo sem nome empresarial separado e distingue convites válidos, expirados e revogados. Estados de envio continuam vindo do servidor.
- Login aberto pelo convite retorna a `/ativar-empresa` na mesma aba. O parâmetro aceita apenas esse destino interno fixo e depende de contexto presente na sessão; não aceita uma URL arbitrária e não concede permissões. A exigência de completar uma identidade pendente continua tendo prioridade; nesse caso excepcional o responsável deve retomar o convite depois de completar o cadastro.
- Na atualização da ativação, a interface limpa a revisão/contexto anterior e trata erros de retomada. Preparação obsoleta não avança visualmente; os bloqueios server-side existentes permanecem.

### Migration indispensável, preparada para revisão

`supabase/migrations/202610210056_commercial_preregistration.sql`.

O banco anterior exigia empresa/e-mail/interesse no armazenamento comum de leads e uma data de contato no cadastro comercial. Apenas esconder campos não resolveria o pré-cadastro. A 056 torna esses campos opcionais no armazenamento e ajusta cinco funções existentes: cadastro comercial, submissão pública, autorização, supressão e elegibilidade de envio. Não cria tabelas, serviços ou dependências. Assinaturas, parâmetros, ACLs, `SECURITY DEFINER`, `search_path`, RLS/FORCE RLS, idempotência, revisão otimista e histórico são preservados.

Atualizações parciais preservam campos omitidos. Mudança/remoção de e-mail invalida autorizações correntes, inclusive comparações com NULL, mas conserva o histórico. Sem e-mail não se registra autorização de comunicação nem se emite convite individual identificado: o endereço deve ser incluído na preparação. Não foi criado um mecanismo paralelo de convites sem destinatário.

**Nenhuma migration foi executada em Supabase ou Neon.** A 056 foi aplicada somente em bancos locais descartáveis PGlite, inclusive sobre fixtures populadas. Para instalações existentes, a alteração atende ao cadastro comercial operacional; não exige alteração do schema demonstrativo 55, dos serviços ou de sua infraestrutura. O bootstrap local de uma base demonstrativa vazia continua aceitando a cadeia completa.

## Auditoria direcionada da ativação

| Ponto | Evidência e conclusão |
|---|---|
| Convite, finalidade, validade, revogação e versão | Controlador existente e RPCs 055 permanecem intactos; testes de revogação, vínculo e versões passaram. O backend consulta o convite, não confia apenas na URL. |
| Identidade do destinatário | **Pendência 056-P01 abaixo.** Há autenticação e vinculação ao primeiro solicitante, mas não correspondência obrigatória de e-mail com o interessado. |
| Login e preservação do contexto | Navegador: contexto no `sessionStorage`, remoção do token da URL, login de conta existente, retorno ao convite, solicitação e retomada após recarregar. |
| Criação de conta | Reutiliza `SelfService identityOnly`, sem alteração do cadastro/autenticação server-side. Provisionamento de identidade e consentimento foram exercitados nos testes locais existentes. Novo cadastro completo com confirmação real de e-mail não foi homologado nesta rodada. |
| Empresa/configuração | `commercial_claim_context` entrega a versão imutável. Aprovação do responsável, snapshot correto e revisão do Super Admin continuam obrigatórios. |
| Plano e termos | Testes A04/A05/A06 do controle comercial exercitam plano, consentimento e preparação pelo fluxo existente. Não foi criado checkout alternativo. |
| Organização sem duplicação | A05/A06: chamadas repetidas reutilizam a organização técnica restrita. Não iniciam trial/publicação. |
| Materialização | A06b: checkout com provedor simulado confirma o contrato local; materialização ocorre depois. Configuração e referências são importadas; dados fictícios operacionais não são transferidos. Falha parcial/retomada e isolamento continuam cobertos pelos testes existentes. |
| Mercado Pago real | Não utilizado. Retorno do navegador não foi convertido em confirmação financeira. |

### 056-P01 — Primeiro solicitante não é comparado ao e-mail destinatário

Causa observada em `202610200055_commercial_versions.sql`, função `public.commercial_claim_request`: a RPC exige usuário ativo, convite válido e bloqueia outro usuário após `claimed_by` ser definido. Porém não compara a identidade autenticada com o e-mail do contato antes do primeiro vínculo.

O teste **056-D01** reproduz: usuário autenticado com e-mail diferente solicita análise, recebe estado `requested`, não recebe organização; outro usuário passa a receber `commercial_claim_conflict`. A tentativa de autoaprovação é recusada e os totais de organizações, contratos e trials permanecem iguais.

Esse teste é **diagnóstico de uma limitação**, não aprovação do requisito de reconhecimento do destinatário. A aprovação exclusiva do Super Admin impede atribuição automática de propriedade, mas o recebimento de um link encaminhado pode ocupar sua solicitação e exigir um novo convite. Uma correção demanda decisão específica sobre identidade destinatária, tratamento de conta com e-mail diferente, recusa e reemissão auditável; não foi implementada nesta rodada.

Enquanto isso, o Super Admin deve conferir o responsável de cada solicitação. Se o convite tiver sido solicitado pela pessoa errada, não aprovar o vínculo; usar os controles existentes de revogação e emissão de novo convite. Não alterar titularidade ou banco manualmente.

## Testes e limites

Resultados completos e comandos: `docs/syzia-056/MATRIZ-DE-TESTES.md`, com logs finais no diretório `evidencias` do pacote.

- `npm ci --no-audit --no-fund`: aprovado, lockfile inalterado.
- Build/typecheck: aprovado; avisos de tamanho de chunk e diretivas de bibliotecas já presentes, sem otimização fora de escopo.
- 056: **21 testes de conformidade local aprovados + 1 teste diagnóstico 056-D01 reproduzindo a pendência**.
- Controle de convites/ativação existente executado com a migration 056 e contratos de UI: **28/28**; log conjunto registra 49/49 incluindo a versão então com 21 casos específicos. O arquivo específico final com D01 foi reexecutado: 22/22 asserções.
- Preparação comercial 054: **41/41**, usando a fixture histórica (regressão; não substitui os testes da 056).
- Fundação/upgrade 055 e HF01/HF02/HF03: **29/29**.
- Integridade específica 056: **3/3**, 1.182 arquivos da base oficial contabilizados, 51 migrations anteriores intactas em bytes no checkout usado, testes negativos de alteração e predecessor inválido preservados.
- Navegador Chromium: **1 jornada integrada aprovada**, com cadastro mínimo, vínculo, elegibilidade, seleções, alteração da prévia, envio fictício, link individual de ativação, login/retomada e larguras 1440/390/360 px sem overflow.
- Banco: PGlite local, não Supabase/PostgREST/Neon reais. Disparos por e-mail e Mercado Pago: simulados. Concorrência: chamadas repetidas/duas abas simuladas, não ensaio de carga PostgreSQL em produção.

O primeiro ensaio do teste de submissão pública usava incorretamente o papel autenticado; foi corrigido para o `service_role` já exigido pela função, sem alterar seus grants. O navegador usou o Chromium já incluído nas dependências, extraído localmente; nenhuma dependência foi adicionada. Um seletor do teste foi corrigido para o nome acessível real do campo Finalidade.

### 056-P02 — Integridade histórica já diverge da main

Numa worktree limpa, sem alterações, `node --test tests/commercial-055/integrity.test.mjs` falhou em 2/2 testes. Primeira divergência apontada: `.env.demo.example`, SHA LF atual `d31538ce35540715be74d960efce4fa3a29434ed5a5c7eccdba8d4268b0e272a`, esperado pelo manifesto anterior `413d64be114080acdc18bb883d6c45ad133cf5fa591c2bb59ca7ed5dabe8c4b2`.

O mesmo bloqueio permanece depois da 056. O arquivo e os manifests históricos **não foram alterados para produzir PASS**. O gate completo não foi repetido: o bloqueio já foi isolado na base oficial, e esta missão pede regressões proporcionais. Portanto não há declaração de gate completo aprovado. A reconciliação dos manifests anteriores com a main exige rodada própria. O novo manifesto 056 registra somente suas transições, com hashes anteriores/novos e proveniência de `ba65468`; não anistia divergências históricas.

## Preservação e entrega

Todos os arquivos de `server/`, financeiro, checkout, HMAC, permissões server-side, autenticação server-side, configurações de infraestrutura e migrations anteriores permanecem idênticos à base oficial. A única alteração na tela de login é navegação para um destino interno fixo após autenticação bem-sucedida.

O pacote contém overlay mínimo, patch, inventário SHA-256, verificações de integridade, relatório, matriz, evidências textuais e guia PowerShell. A aplicação e a reversão do patch foram verificadas sobre outra worktree limpa da base oficial; o build e os três testes de integridade foram executados também nessa cópia com o patch aplicado.

### Resumo de arquivos

| Arquivos modificados | Finalidade |
|---|---|
| `src/platform-commercial/Interested.tsx` | Cadastro mínimo e informações complementares opcionais |
| `src/platform-commercial/Management.tsx` | Vínculos visíveis, pendências, seleção, links, prévia e histórico |
| `src/platform-commercial/policy.ts` | E-mail válido como pré-requisito explícito de elegibilidade |
| `src/platform-commercial/Activation.tsx` | Retomada e revisão do contexto na interface |
| `src/access/EnterpriseAccess.tsx` | Destino interno após login com identidade já preparada |
| `scripts/commercial/browser-fixture-055.mjs` | Opt-in 056 somente em testes locais, e-mail falso e cenário reutilizado |
| `tests/commercial-implementation/control.test.mjs` | Aplicar 056 antes dos mesmos testes de convites/ativação |
| `tests/commercial-055/integrity.test.mjs` | Contabilizar a migration incremental sem dispensar integridade anterior |
| `tests/support/commercial055-integrity.mjs` | Encadear somente as transições explicitamente autorizadas da 056 |

Arquivos novos: componente `InvitationPreparation`, migration 056, testes específicos/Playwright, configuração do navegador, verificador de integridade e documentação/manifests. O inventário completo possui **9 modificados e 12 adicionados** ao repositório, com hashes individuais; os auxiliares de aplicação e os logs ficam no pacote, fora do overlay. Não inclui repositório completo, node_modules, dist, ZIPs anteriores, traces ou acervo histórico. A branch é **local**, não publicada no GitHub.

Pronto para revisão e homologação local da simplificação. Publicação, aplicação da migration real, resolução da vinculação inicial de destinatário e reconciliação histórica continuam pendentes de ações/autorização próprias. Não houve envio real de e-mail, cobrança, alteração de credenciais, push, merge, deploy ou modificação de serviços externos.
