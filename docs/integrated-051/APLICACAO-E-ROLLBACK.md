# Aplicação e rollback — complemento integrado da SYZIA 051

Este guia é para execução posterior pelo proprietário. Nenhuma etapa foi executada no Supabase, Render ou Mercado Pago real nesta rodada.

## Compatibilidade antes de sobrepor

1. Guarde uma cópia íntegra da instalação atual e do ZIP anterior de e-mail do pagador. Não coloque credenciais, arquivos privados ou backups de banco no repositório.
2. Confira localmente a referência Git (`git rev-parse HEAD` e `git show --no-patch 6c33be2`). A autorização posterior permitiu desenvolver sobre a última base entregue. Acesso ao commit remoto não foi comprovado; o pacote não afirma equivalência Git automática.
3. Extraia este complemento **fora** da instalação. Antes de copiar arquivos, execute o verificador que veio no complemento, apontando para a instalação:

```sh
node CAMINHO_DO_COMPLEMENTO/scripts/integrated-051/verify.mjs before CAMINHO_DA_INSTALACAO
```

Ele lê somente os arquivos técnicos inventariados, compara os bytes e aceita exclusivamente diferenças LF/CRLF comprovadas nos textos enumerados. Não lê `.env` real nem pasta privada, não acessa rede, não executa SQL e não altera arquivos. Resultado deve ser `PASS`. `expected_absent`, arquivo ausente, symlink inseguro ou diferença real bloqueiam a aplicação. Não substitua hashes para obter aprovação. A referência inclui os arquivos da entrega anterior; diferenças de relatórios antigos são reportadas, não descartadas silenciosamente.

4. Consulte `INVENTARIO.json` e `SHA256SUMS.txt`. Confira que nenhuma migration histórica foi alterada. O complemento contém somente arquivos modificados/novos; **não** é uma instalação autônoma e não substitui o projeto inteiro.

## Sequência controlada

- Planeje uma janela de manutenção. Pause a API/reconciliador e o recebimento de comandos financeiros antes de trocar código e schema; preserve notificações para nova consulta posterior. Não misture backend novo e schema antigo.
- Faça backup verificável do banco conforme o procedimento operacional existente. A migration 051 já aplicada não deve ser executada outra vez.
- Revise e aplique **somente** `supabase/migrations/202610140052_integrated_subscription_safety.sql`, se ainda não estiver aplicada, pelo procedimento oficial de migrations. Ela é transacional, tem limites de espera/execução, não edita documentos jurídicos e não faz backfill nem exclusão de histórico. A numeração 052 evita alterar a migration 051 existente.
- Sobreponha os arquivos do complemento preservando os demais. Não copie `node_modules`, `dist`, caches, credenciais ou evidências antigas.
- Verifique a instalação atualizada:

```sh
node scripts/integrated-051/verify.mjs after .
npm ci
npm run build
npm run test:051
npm run test:051:browser
node --test tests/integrity-eol.test.mjs
npm run test:current-gate
```

Os testes usam banco descartável local e transporte simulado. Não configure essas fixtures como serviços reais. No ambiente de desenvolvimento sem navegador baixado, use o procedimento de Chromium já documentado no projeto; não modifique os testes para ignorar o navegador.

- Só o proprietário decide quando retomar a API e homologar a assinatura já vinculada. Não faça outro checkout para resolver `billing_binding_mismatch`. Consulte o mesmo contrato/recurso; em dúvida, mantenha o estado de conferência.

## Como usar a verificação adicional simplificada

No painel global, selecione a empresa e abra **Registrar identidade verificada**. Escolha CPF, CNPJ, responsável por CNPJ ou telefone; informe o dado que realmente conferiu; indique o método; confirme a declaração e clique **Confirmar verificação**. Para pessoa física, um único CPF cobre empresa e responsável. Para pessoa jurídica, confira também o responsável. O registro não cria assinatura, não estende trial e não libera capabilities.

Referência e auditoria são geradas automaticamente. Não é necessário informar prefixos técnicos nem anexar documentos a logs. Resultado conflitante continua pendente; não apague identidades anteriores para liberar o benefício.

## Rollback antes de qualquer uso

Com API e reconciliador parados, o arquivo `docs/integrated-051/ROLLBACK-052-ANTES-DO-USO.sql` permite desfazer a estrutura nova somente se não houve nova evidência, vínculo de pagador, atualização de cartão, diagnóstico novo ou lease ativo. Ele falha integralmente se detectar uso. Foi testado em banco local populado, incluindo rollback transacional.

Se a guarda autorizar e a transação concluir, restaure **exatamente** os arquivos modificados da cópia anterior e remova somente os arquivos novos listados no inventário. Execute o verificador em modo `before` a partir do complemento guardado e repita os testes da base anterior. Não reexecute a migration 051 e não restaure dump antigo sobre movimentos posteriores.

## Depois de qualquer uso

**Não há rollback destrutivo automático.** Não apague evidências, contratos, pagamentos, reservas ou aceites para satisfazer a guarda. Pare novas mutações e prepare correção incremental que preserve o histórico. Não volte isoladamente ao backend anterior: ele desconhece o marcador de atualização de cartão incerta e as evidências novas. Um arquivo de backup não autoriza perder transações realizadas após a cópia.

Os logs e matrizes deste complemento são evidência de testes locais; não autorizam deploy nem ativação financeira.
