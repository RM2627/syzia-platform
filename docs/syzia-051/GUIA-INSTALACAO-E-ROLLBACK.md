# SYZIA 051 — instalação e rollback

## Base e conteúdo

Aplicar o ZIP incremental na raiz da **050 consolidada com hotfix financeiro/HMAC e complemento jurídico de versionamento**. O ZIP não contém novamente toda a plataforma: o tamanho reduzido corresponde a arquivos novos e alterados. Não usar como projeto independente nem aplicar sobre 047/048/049.

Preserve uma cópia integral da base 050 antes de sobrepor. Não substituir `.env` ou credenciais por exemplos. Não publicar durante a validação. `INVENTARIO.csv` relaciona cada caminho entregue; `base-050-sha256.json` e `authorized-hashes.json` permitem verificar o ponto de partida e as alterações autorizadas.

## Validação local após sobreposição

Em uma extração nova da base 050, sobreponha o incremental mantendo os caminhos. Use a versão Node compatível com a base (validação desta rodada: Node 24).

```bash
npm ci
npm run build
npm run test:051
npm run test:current-gate
```

O gate executa todas as etapas anteriores e acrescenta diagnóstico/upgrade/integridade 051 e navegador 051. Os fixtures são locais. O runner prepara o Chromium quando necessário; pode-se informar um executável existente com `FOUNDATION_CHROMIUM_PATH`. O gate não requer credenciais Mercado Pago reais.

Não excluir fixtures e medições exigidas pelo gate. Logs, resultados e capturas são reproduzíveis e não fazem parte da base principal. A configuração de produção, o processo Node único e as variáveis financeiras permanecem os da 050.

## Migration 051 — aplicação posterior pelo proprietário

Arquivo: `supabase/migrations/202610130051_checkout_diagnostics.sql`.

Necessária para registrar a falha de checkout corretamente sob lease/lock e fornecer o contexto de contratação sem falso estado pendente. Acrescenta dois campos de diagnóstico seguro, uma RPC exclusiva de serviço e um wrapper do contexto que reutiliza integralmente autorização e projeção existentes.

Não editar/reexecutar migrations históricas, criar baseline ou resetar banco. Confirmar que toda a cadeia anterior, inclusive `202610110050_service_checklists_contact.sql`, já foi aplicada. Fazer backup e executar em ambiente de homologação autorizado antes de produção. A operação tem transação, limite de espera de lock de 5 segundos e limite total de 30 segundos; conflito/erro deve abortar e ser investigado, sem apagar objetos para forçar PASS.

Ordem posterior recomendada: aplicar 051; verificar grants/RLS/contexto; atualizar backend; atualizar frontend. Código novo exige a RPC 051. Não colocar o novo backend em uso contra banco sem essa migration. Recarregar o schema cache pelo procedimento operacional do ambiente, se necessário. Nenhuma dessas ações externas foi executada nesta entrega.

A migration não atualiza contratos existentes nem documentos legais. O wrapper antigo fica sem acesso direto por papéis de aplicação; o novo contexto mantém a permissão `billing.manage`. Não alterar `MERCADO_PAGO_ENABLED`, modo de observação, planos, tokens ou secrets como parte desta instalação.

## Verificação posterior sem criação financeira

Com usuário autorizado, conferir que catálogo, mensalidade, limite e elegibilidade são lidos corretamente. Confirmar que contrato pendente/incerto oferece consulta de situação, sem novo envio automático. Conferir logs por código/status/etapa, nunca ativando dump de body ou debug de headers.

Não reprocessar manualmente MS Auto Details com SQL, apagar contrato, limpar `create_started`, remover reserva de trial ou criar assinatura externa para testar esta instalação.

## Rollback

- **Antes da migration:** restaurar os arquivos alterados da cópia 050 e retirar somente os arquivos adicionados no inventário. Nenhum banco foi alterado.
- **Falha durante a migration:** executar `ROLLBACK` se o cliente manteve a sessão em transação abortada; resolver a causa de lock/erro e revisar. Os testes locais demonstram ausência de alteração parcial.
- **Depois da migration:** preferir rollback de código para a cópia 050, mantendo as adições 051 no banco. O contrato público 047, as colunas anteriores e as permissões permanecem compatíveis. Os campos novos aceitam NULL e não mudam decisões financeiras. O código antigo volta a ter o diagnóstico/UX antigos, portanto registrar essa limitação.
- Não fornecer nem executar um “down” destrutivo que apague diagnósticos, recrie tabelas ou altere aceites. Não restaurar backup sobre transações financeiras ocorridas depois da atualização. Uma reversão física do schema exige análise do estado real e autorização própria.

O rollback de código não cancela assinaturas nem desfaz cobranças, histórico, trial, webhooks ou migrações. Nunca usar o rollback como mecanismo financeiro.

## Limites

SQL foi executado somente em PGlite local. Concorrência de leases/requisições foi exercitada com chamadas assíncronas e rede simulada; isso não substitui PostgreSQL/Supabase externo multiprocesso. Não houve deploy, push, aplicação real de SQL, cobrança ou mudança de credenciais.
