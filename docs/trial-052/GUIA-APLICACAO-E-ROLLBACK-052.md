# Aplicação coordenada e rollback — SYZIA 052 / migration 053

Este guia é para execução posterior pelo proprietário. Nenhuma etapa foi executada em Supabase, Render ou Mercado Pago reais.

## 1. Conferência local

O ZIP é incremental e deve ser sobreposto à última base integrada entregue. Ele não é uma base completa nem deve substituir o diretório inteiro. Preservar arquivos locais privados fora do repositório.

1. Fazer backup local da base atual e guardar o ZIP integrado anterior.
2. Extrair este complemento em uma pasta separada.
3. Conferir os hashes em `docs/trial-052/SHA256SUMS-052.txt`.
4. Antes da sobreposição, executar o verificador desta entrega apontando para a base de destino:

```text
node CAMINHO-DO-COMPLEMENTO/scripts/trial-052/verify.mjs before CAMINHO-DA-BASE
```

O verificador só lê arquivos locais. Aceita diferenças LF/CRLF exclusivamente em caminhos textuais explicitamente inventariados e com hash canônico correspondente; mudanças de conteúdo são recusadas. Se houver divergência, identificar sua origem antes de sobrepor. Não substituir hashes para obter aprovação.

5. Sobrepor somente os arquivos do complemento e verificar:

```text
node scripts/trial-052/verify.mjs after .
npm ci
npm run build
npm run test:051
node --experimental-strip-types --test --test-concurrency=1 tests/trial-052/*.test.mjs
node --test tests/integrity-eol.test.mjs
npm run test:051:browser
npm run test:current-gate
```

O wildcard de arquivos segue o mesmo padrão dos comandos oficiais existentes; em ambientes que não o expandam, informar os quatro arquivos `.test.mjs` da pasta `tests/trial-052` explicitamente.

## 2. Atualização do banco e da API, somente quando autorizada pelo proprietário

1. Confirmar backup/restauração e janela de manutenção, com API e reconciliadores parados para evitar operações durante a troca de versão.
2. Conferir a cadeia existente. A migration `202610140052_integrated_subscription_safety.sql` já aplicada não deve ser repetida ou editada.
3. Aplicar somente a nova `202610140053_automatic_trial_optional_provider_version.sql`, uma vez, com a ferramenta operacional autorizada do projeto. Ela contém transação e proteções contra predecessor inesperado e repetição.
4. Publicar conjuntamente a API e o frontend correspondentes após validação local e autorização externa. Banco primeiro; depois código. Isso é uma instrução operacional, não uma autorização de deploy nesta rodada.
5. Confirmar inicialização e realizar a homologação descrita abaixo. Não alterar credenciais, plano, preço ou mapeamento para contornar falhas.

## 3. Recuperação da assinatura existente

Usar a opção **Atualizar situação** na empresa correta, ou o reconciliador existente conforme o procedimento operacional autorizado. Não abrir nova contratação.

Para o contrato histórico informado, `provider_id` já existe, a operação é checkout e não foi solicitado cancelamento. A recuperação implementada consulta a assinatura e seus recursos oficiais; não faz novo POST de criação. As rotinas gerais de cancelamento e outras intenções explícitas existentes continuam preservadas e não devem ser acionadas nesta recuperação.

Verificar, sem expor valores pessoais ou segredos: permanência do identificador local e do vínculo externo, reserva original, mesmo início/fim do trial, confirmação financeira e uma única concessão. A data exibida deve vir da assinatura oficial compatível, sem reiniciar os sete dias.

Se aparecer outro `validation_check`, manter o bloqueio. `authorized` isoladamente não comprova preço, moeda, trial, datas, vendedor, aplicação, plano ou pagador. Nunca editar o contrato manualmente para liberar acesso.

## 4. Rollback

Antes do uso da 053, com processos parados, o arquivo `ROLLBACK-053-ANTES-DO-USO.sql` restaura as funções anteriores e remove apenas as três colunas novas sem histórico de uso. Ele recusa execução se houver snapshot aplicado, resolução automática de pedido ou lease ativo. Foi testado localmente com banco populado e falha transacional.

Restaurar os arquivos modificados a partir do backup indicado pelo inventário e remover somente os arquivos novos desta entrega. Não remover arquivos privados, migrations históricas ou dados de clientes. Revalidar o build e o gate da base restaurada.

Após uso, não forçar o rollback, não apagar auditoria e não remover colunas com histórico. Manter o estado financeiro e preparar correção incremental. Reinstalar o adaptador antigo pode voltar a bloquear retornos sem `version`; isso não autoriza recriar assinatura ou apagar reserva.

## 5. O que o pacote não executa

Não contém execução automática de SQL real, migração no startup, deploy, chamadas autenticadas ao Mercado Pago ou alterações de credenciais. A nova migration é apenas um arquivo para aplicação posterior e coordenada.
