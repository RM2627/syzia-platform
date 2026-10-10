# Atualização 029 → 030 sem reset

Este guia prepara homologação posterior pelo proprietário. Nenhuma conexão externa, restauração ou implantação foi executada nesta entrega.

1. Confirme que a origem é o consolidado 029 e que todas as migrations 001–029 já constam aplicadas. Compare SHA-256 com `migrations-001-029.json`. Não reaplique nem edite essas migrations.
2. Faça backup consistente de banco, Auth e metadados de Storage no ambiente autorizado. Teste a restauração em ambiente descartável antes de atualizar. Preserve os segredos privados existentes usados para fingerprint/trial; não os substitua.
3. Revise concessões comerciais existentes. Vínculos compartilhados sem capacidade efetiva serão suspensos pela 030. Ative somente a capacidade já autorizada no plano/contrato; não crie assinatura fictícia em ambiente real para contornar a regra.
4. Durante janela de manutenção autorizada, aplique **somente** `supabase/migrations/202609210030_business_finance_permissions.sql`. O arquivo contém uma transação. Erro deve provocar rollback; não continue com trechos isolados.
5. Aplique a versão correspondente do frontend/servidor no ambiente de homologação seguindo os guias existentes. Não combine frontend 030 com banco 029. Recarregue o cache de schema PostgREST pelo procedimento do ambiente quando necessário.
6. Verifique organizações, memberships, solicitações, orçamentos, aceite legal, tutorial/onboarding e histórico de trial. Compare contagens e amostras do backup; valide categorias e versões de planos backfilled. As categorias antigas foram deduplicadas por empresa com `trim/lower`, e os serviços mantêm a representação textual compatível.
7. Percorra os casos de `tests.md`, incluindo Super Admin sem ADM, suporte autorizado 029, primeiro acesso novo, cobrança parcial, estorno, revogação em sessão aberta e tentativa cross-tenant. Conclua as pendências externas antes de aprovar a homologação.

## Mudanças na aplicação dos dados

- Não há reset, truncate ou limpeza de dados empresariais. 001–029 continuam byte a byte intactas.
- Cadastros anteriores recebem estado `legacy`, preservando operação. Novas empresas/primeiro ADM precisam da verificação quando aplicável.
- Grants explícitos preservam leitura empresarial anterior e operações padrão dos atendentes. Não concedem financeiro consolidado a colaboradores/atendentes.
- Orçamentos históricos não são convertidos automaticamente em dívida. Novas aprovações com valor positivo criam conta a receber; aprovação não cria recebimento. Contas manuais permitem reconciliação expressa pelo responsável.
- Nenhuma empresa recebe isenção pelo nome ou pela ausência de ADM.

## Reproduzir localmente

Com Node compatível com o projeto e dependências do lockfile: `npm ci`, `npm run build`, `npm run test:030`, `node scripts/regression-030.mjs`, `node --experimental-strip-types --test tests/calculators-030.test.mjs`, `npm run test:ui`, `npm run test:demo:browser` e `npm run test:demo`. Configure Chromium conforme README; o pacote não inclui binário de navegador nem node_modules.

Para concorrência local real, em Linux com usuário comum: `node scripts/test-native.mjs --030`. O runner cria PostgreSQL descartável em socket local; não aponta para banco externo. Sua execução não foi possível no ambiente desta entrega.

## Recuperação

Não há downgrade destrutivo automatizado. Antes de uma atualização externa, definir e testar restauração coordenada do backup + versão anterior da aplicação, incluindo tratamento de novos lançamentos. Reverter apenas o frontend após gravar dados 030 não é um rollback validado. Não apagar tabelas novas para tentar retornar à 029.
