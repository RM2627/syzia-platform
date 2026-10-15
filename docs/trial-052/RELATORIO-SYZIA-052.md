# SYZIA 052 — Trial automático e versão opcional do Mercado Pago

## Base e limites

Implementação incremental sobre a última base integrada entregue, conforme autorização expressa do proprietário nesta conversa. A identidade integral com o commit `546a906` não foi comprovada e não é pressuposto desta entrega. A consulta pelo acesso GitHub disponível retornou 404; a autorização posterior dispensou essa confirmação.

Referência: `SYZIA-051-COMPLEMENTO-INTEGRADO.zip`, SHA-256 `6527d750b766d2ad5c302e543c056e25665e21b0c6b1d524588836060743502b`, aplicado à base local preservada da entrega anterior. O verificador acompanha os hashes da árvore utilizada, incluindo equivalências estritas de LF/CRLF em arquivos textuais explicitamente inventariados.

Nenhum ambiente real foi consultado ou alterado. Não houve assinatura externa, cobrança, acesso a credenciais, SQL no Supabase, commit, push ou deploy.

## Causa financeira e evidência

O proprietário informou que a leitura autenticada de uma assinatura existente retornou `status = authorized` sem a propriedade `version`. A inspeção e a reprodução local confirmaram que `verifiedSnapshot` exigia `Number.isSafeInteger(p.version) && p.version >= 0`. Para uma propriedade ausente, isso produz exatamente `billing_binding_mismatch/version`.

Essa conclusão é delimitada: explica o diagnóstico informado, mas não comprova que vendedor, aplicação, plano, pagador, preço, recorrência, trial e datas da assinatura real passarão nas demais validações. A assinatura real não foi reconciliada por esta rodada.

## Correção financeira

`providerVersion` distingue ausência da propriedade de valor inválido. Quando ausente, o snapshot não inclui um contador. Quando presente, exige inteiro seguro não negativo; `null`, string, fração, negativo, NaN, infinito e `undefined` explícito são inválidos. Não existe fallback para zero.

Os usos de versão foram auditados na consulta, snapshot, persistência, ordenação, troca de cartão e reconciliação. A migration 053 preserva o último contador efetivamente observado; o valor interno histórico `-1` continua significando que nenhum contador foi observado. Ele não é enviado ao provedor nem representa uma versão remota fabricada.

A aplicação registra também a data oficial de modificação e uma impressão digital das propriedades financeiras normalizadas da assinatura. Sob o mesmo lock e lease, rejeita datas anteriores e conteúdo contraditório na mesma data sem avanço comprovado do contador. Uma versão regressiva continua rejeitada quando presente. Divergências ambíguas permanecem bloqueadas para conferência.

A verificação transacional ocorre antes de qualquer atualização no provedor e novamente na aplicação final do snapshot. Faturas e pagamentos mantêm sua própria ordenação por data oficial e idempotência. Mudanças legítimas em pagamentos não dependem de modificação da assinatura.

Na troca de cartão, a resposta de atualização e a leitura oficial posterior devem indicar o mesmo cartão, com data não anterior à resposta da atualização. Quando os dois retornos têm contador, sua ordem também é validada. Um PUT incerto nunca é reenviado automaticamente: a recuperação consulta o cartão já vinculado e exige mudança oficial observável. Caso isso não seja demonstrado, a operação continua pendente.

Contratos históricos com `provider_id` são reconciliados pelo identificador já vinculado. Os testes demonstram ausência de novo POST, manutenção de `external_reference`, idempotência, reserva e datas originais, além de concessão única. O retorno do navegador não confirma assinatura sozinho.

## Elegibilidade automática

O bloqueio anterior vinha de `private.billing051_eligibility`, que exigia evidência documental ou verificação adicional auditada, além dos identificadores cadastrais. Isso não corresponde à nova decisão de produto.

A política comercial agora aceita identificadores provenientes dos fluxos existentes que validam documentos e armazenam fingerprints protegidos. CPF com ou sem máscara é validado nos dois dígitos; comprimento incorreto, repetições, letras, caracteres inesperados e formatos inválidos são rejeitados. O frontend reutiliza um normalizador compartilhado, e o banco mantém a validação autoritativa com o mesmo contrato para CPF. O tratamento preexistente de CNPJ foi preservado.

Foram auditadas as origens cadastrais 030, 033, 040 e 047. O CPF estrutural já confirmado pelo fluxo da 040 também é reconhecido, sem nova digitação, regravação do identificador ou criação de evidência documental. Um teste de upgrade preserva esses registros e comprova a reavaliação.

Não é necessário registrar prova documental, telefone verificado ou aprovação do superadministrador para todo primeiro trial. As antigas opções de política manual continuam restritas ao fluxo histórico de demonstração/simulação; não governam a elegibilidade das assinaturas comerciais desta atualização.

Continuam impeditivos o consumo anterior, reservas de outro contrato, vínculos históricos conhecidos, negativas anteriores e conflitos objetivos de identificadores. A reserva do próprio contrato é reconhecida e não aparece como utilização por terceiro. Uma empresa diferente com o mesmo responsável conhecido não recebe novo trial. E-mail pagador, cartão e plano não são usados como forma de renovar elegibilidade.

Nenhum registro falso é inserido em `billing051_identity_evidence`. CPF matematicamente válido não comprova titularidade, existência ou regularidade cadastral. Sem prova independente de identidade, não há garantia de impedir todo abuso com documentos de terceiros.

## Histórico e interface

Solicitações antigas são reavaliadas pelo backend com o cadastro existente. Rascunhos de aquisição em revisão genérica recebem uma projeção atualizada sem alteração retroativa da submissão, revisão ou validade da oferta. Pedidos de trial pendentes só são concluídos automaticamente após a confirmação financeira válida e a concessão efetiva, com auditoria própria e sem atribuir a decisão a um verificador humano fictício.

A interface informa “Assinatura em conferência” para reconciliação financeira. Corrigir um CPF não exige aprovação administrativa. O botão único, o e-mail pagador independente, o cartão integrado, o design do resumo e o CSS aprovado foram preservados.

## Banco e segurança

A única migration nova é `202610140053_automatic_trial_optional_provider_version.sql`. Ela é transacional, usa timeouts, preserva locks, mantém funções anteriores revogadas e não edita migrations históricas. A atualização financeira reutiliza o corpo existente; a atribuição do contador e a limpeza de erro após uma leitura válida repetida são adaptadas com verificação estrita dos trechos predecessores esperados.

Os testes cobrem upgrade com dados existentes, falha transacional, rollback antes do uso, recusa de rollback após uso, permissões de funções antigas e RLS/FORCE RLS. Não há alteração de preço, trial de sete dias, tolerância de três dias, cancelamento, planos ou regras de cobrança. O receptor e a validação HMAC permanecem com os mesmos bytes no trecho protegido.

## Validação e entrega

Os resultados finais estão em `MATRIZ-E-RESULTADOS-052.md` e `GATE-FINAL-052.json`. A matriz diferencia testes locais simulados de homologação externa. Os testes históricos da política 052 são mantidos explicitamente contra a migration anterior; as regressões financeiras atuais e os novos testes exercitam a 053. Nenhum teste foi removido ou marcado como skip para aprovar a mudança.

Aplicação e rollback: `GUIA-APLICACAO-E-ROLLBACK-052.md`. Dependências externas: `PENDENCIAS-EXTERNAS-052.md`. Inventário e hashes: `INVENTARIO-052.json` e `SHA256SUMS-052.txt`.
