# Relatório — trial configurável e prevenção de abuso

**Complemento da Fase 8 implementado e testado localmente. Homologação externa continua PENDENTE.** Não foi iniciada nova fase, publicação, integração paga ou cobrança real. O projeto permanece cumulativo das Fases 2–8, com dados exclusivamente fictícios.

## O que mudou

A demo agora usa **15 dias de trial configurados na versão do plano**. A duração continua editável; um teste específico usa 9 dias para comprovar que não depende de constante no frontend. Trial não exige meio de pagamento real.

O benefício passou a possuir registro privado persistente por organização: concessão, plano/versão, início, término, status, ator, modo automático/administrativo/migrado e extensões. A tela mostra os dias restantes, a data e hora exatas de encerramento, o plano e as consequências. Ao expirar, as regras server-side da assinatura bloqueiam novas operações sujeitas ao plano, preservando dados/histórico e o acesso autorizado à contratação/reativação.

A concessão automática exige identidade empresarial ou de responsável verificada, conforme política. Conta autenticada, administradores da organização, identificadores empresariais/de responsável e telefone verificado configurado são confrontados com benefícios anteriores. Trocar e-mail/usuário/empresa não basta para conceder novamente. Sem prova suficiente ou diante de correspondência anterior, o pedido vai à análise sem gerar trial/cobrança. Dispositivo/rede não são coletados nem usados como bloqueio definitivo.

Identificadores são normalizados e transformados em fingerprints com segredo privado; o texto original não é retido. Hashes, valores e dados de outra empresa não aparecem no contexto do gestor. O registro não depende de FK que o apague ao excluir organização/conta, e DELETE/TRUNCATE são bloqueados. Concessões legadas são importadas; datas históricas que não podem ser reconstruídas com segurança ficam sinalizadas como incertas.

Superadmin pode registrar evidência verificada, configurar elegibilidade, analisar exceções, conceder ou estender trial. Exige autorização atual, motivo, confirmação de exceção, revisão e idempotência. Decisões ficam auditadas; não se apaga o consumo anterior. Plano pago ou suspenso não é convertido em novo trial por extensão. Limite de dias por ação administrativa é configurável.

## Barreiras contra abuso

A prevenção não depende só de e-mail ou de botão escondido. O caminho anterior de concessão foi preservado em função privada sem EXECUTE para clientes; a entrada pública aplica elegibilidade. Trava transacional e índice único de identidades consumidas protegem concessões automáticas. Exceções administrativas preservam a primeira identidade consumida e registram o novo benefício auditado.

Solicitação em análise/recusada sem vigência não libera operações pelo caminho legado sem assinatura. Empresas anteriores sem solicitação de trial preservam a compatibilidade já existente; a criação de organizações continua restrita ao superadmin, como na Fundação.

Uma pessoa com identidade inteiramente nova e sem evidência comum não pode ser reconhecida por mágica. O sistema recusa a concessão automática sem prova verificada; a qualidade da prevenção depende também do procedimento de conferência. **Verificação implementada é atestação administrativa de evidência conferida, não consulta automática a órgão, SMS/OTP ou prova de identidade real.** Essas integrações não foram executadas.

## Arquivos, banco e interfaces

- Nova migration: `supabase/migrations/202609180021_trial_eligibility.sql`; **21 migrations cumulativas**. As 20 anteriores estão intactas, com comparação byte a byte registrada.
- Dez tabelas novas **privadas**, todas RLS/FORCE RLS e sem grants para anon/authenticated/service_role: trial_secret, trial_policy, trial_identifiers, trial_grants, trial_claims, trial_consumed_keys, trial_extensions, trial_requests, trial_admin_commands, trial_audit.
- 63 tabelas públicas e 63 policies SELECT anteriores preservadas. Nenhuma tabela antifraude pública ou policy de escrita adicionada.
- Três RPCs novas: billing_trial_verify, billing_trial_policy_save, billing_trial_admin. Wrappers atualizados de billing_subscription_action e billing_context; guardas billing_feature/billing_guard reforçadas.
- Inventário completo: `docs/trial-sql-inventory.md` e `reports/trial-sql-catalog.json`, incluindo funções/grants, constraints, 15 índices e 28 triggers relacionados ao registro.
- `src/billing/Trial.tsx`, integração em Billing e estilos: período restante, análise, formulários administrativos, política, histórico e mensagens de erro dentro do modal. Mantidas as rotas `/painel/:orgId/assinatura` e `/admin/assinaturas`.
- Demo, testes, package.json, README, AGENTS, arquitetura, guias e instruções cumulativas atualizados. Screenshots em `reports/visual-trial`.

## Testes executados

**545 casos únicos aprovados localmente, zero falhas locais conhecidas restantes.** São 45 novos: 42 testes SQL de trial, 1 teste de upgrade e 2 jornadas de navegador. Reexecuções não aumentam a contagem. Matriz completa: `docs/trial-test-matrix.md`; consolidação: `reports/trial-summary.json`.

Cobertura nova: troca fictícia de e-mail, outra conta/organização, mesma empresa/responsável, telefone declarado versus verificado, cancelamento/recriação, suspensão, tombstone, persistência, manipulação direta, falta de prova, normalização, políticas, exceções/recusa, papel revogado, extensões repetidas/revisão obsoleta, expiração, contratação posterior, separação de dados, ausência de hashes nas respostas e FORCE RLS. Índice único testado também sem depender da pré-checagem de elegibilidade.

Regressão cumulativa executada: Fundação, Empresa, Consumidor, Presença/pagamentos preparados, Central, Comercial, Analytics, Billing, upgrades, ferramentas, imagens e configuração. **54/54 testes UI e 14/14 testes da demo** aprovados; depois da tradução dos rótulos administrativos, as duas jornadas novas foram reexecutadas com sucesso. Os reforços finais de unicidade/guardas foram revalidados em trial, billing, upgrade e demo.

Build/TypeScript e scanner de bundle aprovados. Inventário confirma 63 tabelas públicas e dez privadas de trial com FORCE RLS. Hashes de 001–020 preservados. Inspeção visual local de celular e desktop confirmou leitura do prazo, informações de término, análise e histórico. Dados, Auth e Storage da demonstração continuam simulados; PostgreSQL local é PGlite/WASM.

## Correções durante a revisão

A proteção antiga de trial apenas por organização foi substituída pelo histórico entre identidades. A revisão também identificou que uma solicitação em análise não deveria herdar acesso operacional gratuito do modo legado sem adesão; a guarda foi acrescentada e testada. A unicidade no banco complementa a consulta/trava para evitar depender exclusivamente de leitura prévia.

Erros de validação administrativa passaram a aparecer dentro do modal. Comandos de concessão/extensão mantêm chave/revisão para retry após falha de resposta. Os testes foram corrigidos para usar o SQLSTATE real da proteção de imutabilidade e simular expiração de assinatura/concessão de maneira consistente; nenhuma proteção foi afrouxada para fazê-los passar.

## Não executado e pendências

O runner de concorrência nativa foi executado, mas saiu com **código 2 antes de iniciar o banco**, pois o contêiner não permite mapear usuário não-root exigido pelo PostgreSQL. Portanto, os três cenários de conexões independentes estão **preparados, mas NÃO EXECUTADOS**: mesma identidade em duas organizações, mesma extensão/chave e revisões concorrentes. Testes seriais no PGlite não são apresentados como concorrência real.

`npm run test:trial:native` permite repeti-los em máquina local compatível, sem conexão remota. Supabase real, PostgREST/JWT, prova externa de identidade/telefone, concorrência real, proteção contra abuso do provedor, backup/restauração e operação do segredo permanecem PENDENTES DE HOMOLOGAÇÃO EXTERNA. Guia específico: `docs/trial-homologation.md`, integrado ao guia completo.

Antes de qualquer dado real, Marcelo deverá definir o procedimento de verificação, finalidade/retenção aplicável e política comercial final. O hash é pseudonimização, não anonimização. O segredo e o histórico precisam acompanhar backup protegido; perder/regenerar o segredo sem migração impede comparar identidades anteriores. Nada disso autoriza coleta real, contratação ou lançamento nesta entrega.

## Entrega e parada

`Projeto-Fase-8-Final.zip` atualizado contém o projeto completo, não apenas o complemento: código, 21 migrations, scripts, testes, fixtures, assets, configuração, lockfile, documentos, evidências e MANIFEST.json verificado. Dependências/builds e credenciais reais não são incluídos; reconstrução por npm ci/build.

Desenvolvimento local deste complemento concluído. **Produto não homologado externamente e não publicado.** Parar e aguardar autorização de Marcelo para qualquer próxima etapa.
