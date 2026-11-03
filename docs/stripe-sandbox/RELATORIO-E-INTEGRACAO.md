# SYZIA — Sandbox Stripe geral (072)

## Resultado

Implementação incremental preparada, com autorização geral **desligada por padrão**.
21 testes direcionados aprovados. Migration integral e homologação online **não executadas**.
Nenhum checkout, cobrança, chamada à Stripe, push, deploy ou alteração de banco remoto foi realizado.

Base oficial consultada no GitHub: `main`, commit
`9f88ecc91e4fbd31f11d3e790ef5a3af27367ac5`, que já incorpora 071-HF02.
Branch local: `syzia-stripe-sandbox-general`. A main não foi modificada; nenhum commit foi criado.

## Diagnóstico e cobertura

A restrição não estava apenas no contexto. Foram encontrados quatro pontos SQL
efetivos, mais os consumidores existentes no servidor e na interface:

| Local | Responsabilidade | Alteração |
|---|---|---|
| `public.billing069_context_pre071(uuid)` | Retorna `test_allowed` | Consulta o predicado compartilhado |
| `public.billing069_prepare_pre071(...)` | Autoriza preparação do contrato | Consulta o mesmo predicado |
| `public.billing069_service('start',...)` | Revalida antes da criação externa | Consulta o mesmo predicado |
| `public.billing069_service('apply',...)` | Autoriza aplicação da confirmação oficial | Consulta o mesmo predicado |
| Wrappers públicos 071 | Catálogo e disponibilidade comercial | Preservados |
| `server/billing/stripe/controller.mjs` | Exige `test_allowed` antes de preparar | Preservado; recebe a nova decisão SQL |
| `server/billing/stripe/runtime.mjs` | Auth, sessões, ambiente e switches Render | Preservado |
| `src/billing/subscription-view.ts` | Habilita início da contratação | Preservado; consome `test_allowed` |
| `src/billing/SubscriptionCheckout.tsx` | Início/continuação e contexto da organização | Preservado; consome `test_allowed` |

Não existe uma segunda allowlist no frontend. O catálogo permanece visível
independentemente dessa autorização, conforme o hotfix anterior.

## Regra e administração

Nova coluna privada: `private.billing069_runtime.test_all_organizations`, booleano
NOT NULL, DEFAULT false. Nova função privada:
`private.billing072_organization_allowed(uuid, private.billing069_runtime)`.

| Ambiente | Opção geral | Organização na allowlist | Resultado do escopo |
|---|---|---|---|
| test | false | não | bloqueado |
| test | false | sim | permitido |
| test | true | sim ou não | permitido |
| production | qualquer | qualquer | comportamento anterior preservado; outros bloqueios de produção continuam obrigatórios |

Organização nula e ambiente desconhecido retornam false. A regra de escopo não
substitui autenticação, sessão, `billing.manage`, elegibilidade, limite de uso,
contrato existente, aceite, reserva de trial, lease ou confirmação oficial.

A configuração usa `public.billing072_configure_sandbox(boolean)`, executável
somente pelo papel de serviço e pelo proprietário do banco, como o configurador
financeiro 069 existente. Não há controle público nem nova chave de serviço no
frontend. Administradores de empresas não podem alterar a opção. Não foi criado
um botão administrativo novo: a configuração é operacional e explícita, por SQL
do proprietário ou RPC administrativa segura existente no servidor.

A RPC rejeita null e recusa ativar o modo geral se o runtime não estiver em
`test`. Usa o mesmo advisory lock financeiro `734921501` e lock na linha do runtime.
Audita mudanças reais com `stripe_sandbox_general_enabled` ou
`stripe_sandbox_restricted_enabled`; repetir o mesmo valor não duplica o evento.
Não modifica modo de checkout, confirmação, ambiente, allowlist ou mapeamentos.

## Preservação e atomicidade

Somente quatro expressões são substituídas em três funções. As substituições
exigem as ocorrências exatas esperadas (1, 1 e 2); se a base for diferente, ocorre
`billing072_predecessor_mismatch` e a transação deve ser revertida.
Os wrappers 071, permissões, SECURITY DEFINER e search_path das funções existentes
são preservados pelo CREATE OR REPLACE obtido de `pg_get_functiondef`.

RLS/FORCE RLS, grants existentes, schemas financeiros, histórico de trial,
contratos, preços, Price IDs, Mercado Pago, webhooks e reconciliação não foram
reescritos. A aplicação de confirmação conserva os controles de ambiente,
conta, lease, vínculo, valor, estado, trial e snapshot. `apply` continua possível
com novas vendas desligadas, quando confirmação e escopo autorizam.

A migration é transacional, com lock_timeout de 5s e statement_timeout de 60s.
É de aplicação única: uma segunda execução falha por coluna já existente, sem
redefinir a opção para false. Em qualquer erro, executar ROLLBACK na mesma sessão
antes de outra operação. Não retirar as verificações de predecessor para forçar aplicação.

## Testes e limites

Comando executado na raiz, Node 24.22.1 / PGlite 0.5.8:

```powershell
node --experimental-strip-types --test --test-concurrency=1 tests/stripe-sandbox/sandbox.test.mjs tests/subscription-ui/view.test.mjs tests/subscription-hf02/security.test.mjs
```

Resultado final: **21 PASS, 0 FAIL, 0 SKIP**. Log: `tests.txt` nesta pasta.

- 14 casos novos: padrão seguro; allowlist/geral/retorno restrito; nulos; isolamento
  test/production; permissões da RPC e da tabela; auditoria e rollback transacional;
  substituições exatas; inversão estrutural; matriz de 24 combinações de configuração;
  frontend/controlador; revogação após leitura do contexto; autenticação, organização
  e payload; propagação das recusas financeiras; switches Render.
- 7 regressões existentes: 5 de apresentação/estado financeiro e 2 do HF02.
- Um erro na expectativa do teste novo foi corrigido: a consulta final do contexto
  pelo controlador também faz parte do fluxo. Nenhum comportamento financeiro foi alterado.

Os testes novos instanciam uma **fixture mínima em memória**, executando apenas as
definições do predicado/RPC e as expressões reais dos quatro guards. Não aplicam a
migration 072 nem a cadeia histórica à aplicação. O controlador real usa respostas
SQL/provedor simuladas; a lease não concede contrato nem acesso. Os testes de RLS
verificam a fixture e os grants novos, não constituem homologação do Supabase real.

**NÃO EXECUTADO:** migration completa sobre o esquema integrado; rollback estrutural
em banco completo; concorrência PostgreSQL entre conexões; Supabase/PostgREST online;
checkout ou confirmação Stripe real; navegador. Esses limites atendem à restrição
de não executar migrations nesta rodada. Build e gate geral não foram repetidos:
nenhum arquivo TS/JS, CSS, dependência ou configuração de build foi alterado.

## Aplicação do patch no PowerShell

Usar um checkout limpo da base acima. Preservar alterações posteriores; se a base
local divergir ou já houver outra 072, revisar a integração antes de aplicar.
O pacote contém `files/` para inspeção; não sobrepor esses arquivos e aplicar o
patch na mesma cópia, pois isso duplicaria a aplicação.

```powershell
git status --short
git rev-parse HEAD
git switch -c syzia-stripe-sandbox-general
git apply --check C:\caminho\SYZIA-STRIPE-SANDBOX-GERAL.patch
git apply C:\caminho\SYZIA-STRIPE-SANDBOX-GERAL.patch
node --experimental-strip-types --test --test-concurrency=1 tests/stripe-sandbox/sandbox.test.mjs tests/subscription-ui/view.test.mjs tests/subscription-hf02/security.test.mjs
```

Não executar o patch via edição manual das migrations históricas. Conferir os
SHA-256 no inventário do pacote. A alteração SQL dispensa rebuild do frontend e do
backend; ambos já consomem a decisão autoritativa do banco.

## Após revisão/publicação autorizada: migration e habilitação

**Comandos abaixo não foram executados.** São etapas futuras do proprietário.

1. Antes de qualquer SQL, obter backup recuperável pelo procedimento já utilizado
   no projeto: esquema/funções/ACL e dados financeiros, incluindo runtime,
   mapeamentos, contratos e auditoria. Guardar fora do Git; confirmar recuperação.
   Não presumir que o plano do Supabase tenha backup automático disponível.
2. Confirmar que 069/070/071 estão integradas e que não há uma 072 conflitante.
3. Sob autorização de aplicação, executar uma vez o arquivo completo
   `supabase/migrations/202611030072_stripe_sandbox_scope.sql`, sem fragmentá-lo.
   A opção permanece false; nenhum contrato é criado.
4. Conferir o estado sem expor segredos:

```sql
select checkout_mode, environment, confirmation_enabled,
       test_all_organizations, cardinality(test_organizations) as allowlist_count
from private.billing069_runtime where singleton;
```

5. Com `environment = 'test'`, habilitar explicitamente o escopo geral:

```sql
select public.billing072_configure_sandbox(true);
```

6. O passo anterior **não liga o checkout sozinho**. Para disponibilizar novas
   contratações de teste, os switches existentes também precisam estar autorizados:

| Local | Estado necessário para novas contratações de teste |
|---|---|
| Banco `billing069_runtime` | environment=test, checkout_mode=stripe, confirmation_enabled=true |
| Render | STRIPE_ENABLED=true, STRIPE_ENVIRONMENT=test, BILLING_CHECKOUT_MODE=stripe, STRIPE_OPERATIONS_ENABLED=true |
| Render | STRIPE_PRODUCTION_CONFIRMED=false; manter credenciais/IDs de teste existentes |
| Catálogo | Ofertas publicamente disponíveis para contratação conforme configuração 071 |

Se esses switches já estiverem corretos, não alterá-los. Se ainda estiverem
bloqueados, sua habilitação é uma etapa operacional separada do proprietário.
Para o banco, reutilizar `billing069_configure`, preservando a lista atual e
passando `[]` como mapeamentos, sem cadastrar nem alterar IDs. Exemplo protegido:

```sql
begin;
select pg_advisory_xact_lock(734921501);
do $$begin
 if (select environment from private.billing069_runtime) is distinct from 'test' then
  raise exception 'billing_environment_mismatch';
 end if;
 perform public.billing069_configure('stripe','test',true,
   (select test_organizations from private.billing069_runtime),'[]'::jsonb);
end;$$;
commit;
```

Essa chamada mantém a validação dos três mapeamentos já existentes. Não trocar
ambiente para contornar bloqueios; não alterar valores ou credenciais.

7. Primeiro validar sem contratação: entrar como administrador autorizado de uma
   organização fora da allowlist, atualizar Plano e assinatura e conferir
   `/billing/checkout`: environment=test, test_allowed=true e os três valores
   preservados. Repetir com outro administrador da própria organização. Identidade
   sem permissão deve continuar recusada. Não compartilhar tokens ou respostas
   com dados pessoais. A opção só muda a autorização de escopo, não a elegibilidade.
8. Checkout de teste e confirmação oficial são homologações posteriores, com
   autorização própria e cartão fictício. Nunca concluir acesso apenas pelo retorno.

## Rollback

**Preferencial:** voltar ao modo restrito sem remover estrutura ou histórico.
Antes, identificar os contratos Stripe de teste correntes fora da allowlist:

```sql
select distinct c.organization_id
from private.billing047_contracts c
join private.billing069_stripe s on s.contract_id=c.id
cross join private.billing069_runtime r
where c.provider='stripe' and c.current and s.environment='test'
  and not coalesce(c.organization_id=any(r.test_organizations),false);
```

Se existirem, revisar e preservar na allowlist as organizações que precisam
continuar sendo reconciliadas, usando o configurador administrativo 069 e mantendo
os demais valores. Depois:

```sql
select public.billing072_configure_sandbox(false);
```

Desligar o modo geral **não cancela assinaturas nem remove concessões existentes**.
Como o mecanismo original restringe também `apply`, uma organização retirada do
escopo fica impedida de aplicar novas confirmações até ser autorizada novamente.
Não usar esse toggle como substituto de cancelamento ou revogação financeira.
Para suspender só novas contratações, usar os switches existentes de checkout,
mantendo a configuração necessária à reconciliação.

**Estrutural, somente se necessário e após revisão:** depois de false e da revisão
da allowlist, executar `docs/stripe-sandbox/rollback-072.sql`. Restaura as quatro
expressões anteriores, remove apenas as duas funções/coluna novas e registra o
evento de rollback. Não apaga auditoria, contratos ou migrations históricas.
Falha se o modo geral ainda estiver ligado ou os predecessores diferirem.
Se houver migrations posteriores dependentes da 072, não executar esse rollback
sem análise; não usar CASCADE. Ajustar o registro de migrations pelo procedimento
oficial do projeto, sem fingir que a migration continua aplicada após a reversão.

Para reverter somente os arquivos locais, antes de execução da migration:

```powershell
git apply --reverse --check C:\caminho\SYZIA-STRIPE-SANDBOX-GERAL.patch
git apply --reverse C:\caminho\SYZIA-STRIPE-SANDBOX-GERAL.patch
```

## Inventário resumido

Todos os itens são novos; nenhum arquivo histórico foi modificado.

- `supabase/migrations/202611030072_stripe_sandbox_scope.sql`: opção e regra única.
- `tests/stripe-sandbox/sandbox.test.mjs`: 14 casos direcionados.
- `docs/stripe-sandbox/rollback-072.sql`: reversão estrutural protegida.
- `docs/stripe-sandbox/RELATORIO-E-INTEGRACAO.md`: este relatório e instruções.
- `docs/stripe-sandbox/tests.txt`: evidência dos 21 testes.

Conclusão: preparado para revisão e aplicação autorizada; **não habilitado online
por esta execução**. Aplicação integral da migration e homologação externa continuam
pendentes, explicitamente separadas da evidência local.
