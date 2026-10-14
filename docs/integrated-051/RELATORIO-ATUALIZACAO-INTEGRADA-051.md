# SYZIA 051 — complemento integrado

## Resultado e limites

Atualização incremental sobre a última base entregue de e-mail do pagador, conforme autorização posterior do proprietário. Não é reconstrução nem uma nova base completa. O commit remoto `6c33be2` não pôde ser comprovado nesta sessão; a consulta retornou indisponibilidade/404. A referência verificável é a base entregue anteriormente, com seus 930 arquivos de origem e dez arquivos de entrega/verificação, inventariados antes das alterações. Não se afirma identidade Git que não foi demonstrada.

Nenhum SQL real, deploy, commit, push, cobrança, assinatura externa, credencial ou configuração de Render/Supabase foi alterado. Dados e transporte de testes são fictícios. MP-01, HTTP 400 e o incidente externo de `billing_binding_mismatch` não são declarados resolvidos por simulações.

## A — trial verificável e revisão adicional simples

**Causa local comprovada:** os identificadores autodeclarados e os verificados administrativamente compartilham o registro histórico de identificadores. Um `ON CONFLICT DO NOTHING` podia manter a referência autodeclarada mesmo após conferência administrativa. Usar apenas a existência desse registro como prova seria inseguro; exigir a referência antiga perfeita também não representaria a conferência posterior.

A migration 052 acrescenta evidência privada, imutável e vinculada à organização, tipo e fingerprint. A RPC histórica de verificação é reutilizada; seus controles de superadministrador, confirmação explícita, auditoria e normalização permanecem. Registros antigos não são reescritos. Evidência histórica só é aproveitada quando há referência não autodeclarada e auditoria correspondente de verificação. Conhecer um CPF não transfere prova positiva de outra organização; histórico negativo e consumo continuam compartilhados para impedir abuso.

O backend decide a elegibilidade automaticamente quando **todas** as evidências exigidas pela política são confiáveis e não há consumo, reserva concorrente, negativa, contradição ou política de análise manual. Antes de criar a assinatura e antes da primeira concessão, a decisão é revalidada sob lock. O trial só é concedido após confirmação oficial da assinatura e do meio de pagamento. Não há concessão administrativa inventada.

**Simplificação solicitada:** no painel existente, o superadministrador informa CPF/CNPJ/telefone, seleciona como conferiu e confirma a análise. Não precisa escrever `BR:CPF`, códigos de evidência ou justificativa técnica. Uma conferência de CPF de pessoa física registra empresa e responsável atomicamente. Para CNPJ, o CPF do responsável continua sendo uma conferência separada. Referência de auditoria e texto descritivo são gerados automaticamente, identificando uma declaração administrativa explícita. Telefone não substitui a conferência de documento. Permissões e exigência de confirmação continuam no backend.

**Limitação importante:** não existe nesta base um provedor independente de verificação de identidade. CPF digitado e confirmação de conta não se tornam KYC. Clientes sem evidência confiável continuam dependendo da verificação adicional; a atualização automatiza a decisão sobre evidências existentes, não promete eliminar todas as análises humanas. Política manual e identidades conflitantes continuam excepcionais.

## B — assinatura vinculada e reconciliação

**Comprovado no código:** várias verificações diferentes retornavam o mesmo `billing_binding_mismatch`. O log genérico não permite determinar qual falhou no incidente real.

Agora, o diagnóstico informa somente um nome estático permitido, como `application_id`, `plan_id`, `version`, `payer_id`, `amount` ou `trial_dates`. Nunca informa os valores comparados, e-mail, token, documento ou corpo de resposta. Correlação e códigos anteriores permanecem. O banco registra esse motivo seguro para o contrato; ele não é exposto como detalhe técnico ao consumidor.

Há consulta do recurso existente quando `provider_id` está presente. Se a criação pode ter ocorrido sem ID local, a busca por referência precisa retornar exatamente um recurso válido. Busca vazia/múltipla e resposta incerta não autorizam novo POST. Referência local, vendedor, aplicação, plano, pagador oficial, moeda, valor, ciclo, trial e pagamentos são verificados antes de qualquer alteração no provedor e novamente após uma alteração.

A primeira confirmação válida registra o identificador oficial do pagador para detectar divergências posteriores. Contratos históricos sem esse campo aproveitam o pagador retornado pela consulta oficial apenas depois de validar os outros vínculos; e-mail enviado pelo cliente não seleciona nem transfere assinatura. Datas originais de trial registrado são comparadas estritamente, inclusive nas atualizações de cartão.

Uma simulação reproduziu `subscription_linked` seguido de mismatch ao devolver `version` em tipo inválido. Isso testa diagnóstico e recuperação; **não prova que a versão seja a causa do incidente real**. Não foi adicionada coerção de versão, alteração de plano/data, cancelamento ou afrouxamento para recuperar artificialmente o contrato.

O reconciliador separa operações pendentes de execuções concluídas e informa uma contagem adicional de estados locais confirmados. `succeeded` continua significando processamento concluído, não pagamento aprovado. Não se usa essa contagem para liberar capabilities.

## C — uma ação no checkout

Os campos, CSS, composição, resumo e layout aprovados foram preservados. O único submit valida os campos e o e-mail confirmado, chama `cardForm.createCardToken()` e só envia o comando após `onCardTokenReceived` válido. O submit nativo não aciona em paralelo outra tokenização. Callback duplicado/tardio, duplo clique, campos inválidos ou token ausente não geram um segundo comando.

CTA elegível: **Iniciar meus 7 dias grátis**. Sem novo benefício: **Confirmar assinatura mensal**. Não há sucesso baseado apenas na tokenização. `payer_email` continua sendo o e-mail confirmado no formulário, separado de `actor.email`. A conta e o CPF administrativo permanecem intactos. Timeout ou operação vinculada continuam encaminhados à reconciliação, sem nova criação.

## D — assinatura, histórico e troca de cartão

A área existente ganhou datas de trial confirmadas, últimos quatro dígitos quando encontrados em pagamento oficial associado ao mesmo cartão e histórico das últimas 50 cobranças. Todos os registros anteriores permanecem no banco. Não se fabrica final de cartão a partir de `card_id`; se não houver evidência, mostra-se apenas o método confirmado. Não foi criado endpoint ou tela financeira paralela.

A atualização usa `PUT /preapproval/{id}` com token oficial, na assinatura existente. Antes do PUT, o vínculo e snapshot são validados. Depois, confirmação do PUT e nova consulta precisam concordar. Se o resultado ficar incerto, a intenção e o cartão anterior são preservados e novas tentativas mutantes ficam bloqueadas. A reconciliação pode concluir quando a consulta oficial demonstra a alteração; não repete PUT com outro token para contornar incerteza.

Rejeição definitiva do PUT permite nova tentativa explícita, preservando estado de tolerância, trial e histórico. Trocar cartão não significa quitar fatura. Somente pagamento confirmado restaura o acesso conforme regras existentes; os três dias de tolerância não foram alterados. Não foram implementadas cobranças paralelas às retentativas do Mercado Pago.

## Preservação e ajustes de testes

As 47 migrations anteriores, preços, duração do trial, HMAC, configuração financeira, credenciais, documentos e aceites jurídicos permanecem intactos. A nova migration é 052 porque 051 já existe; o produto continua sendo o complemento solicitado da SYZIA 051.

Os fixtures financeiros passaram a registrar conferência explícita fictícia, em vez de assumir que CPF digitado é prova. Um cenário antigo de passagem do tempo foi corrigido para mover coerentemente as datas fictícias local e do provedor; a edição unilateral agora é rejeitada e há teste negativo dedicado. Assertions de cancelamento, preservação e antifraude foram mantidos. A contagem histórica de migrations passou a conferir a lista exata de 46 arquivos anteriores mais 051 e 052; nenhum arquivo histórico foi excluído da verificação. O teste legado de trial recebeu apenas os seletores do formulário simplificado. Uma tentativa suplementar de executar sua jornada histórica expôs incompatibilidades anteriores de navegação/ativação/revisão, fora do gate vigente. Não se alterou Auth nem a política de concessão para acomodar esse teste; essa execução não recebeu PASS. A cobertura atual de revisão simples é feita pelos testes INT-A e pelos dois casos desktop/mobile da suíte 051. Os testes de navegador usam os novos rótulos e a confirmação simples; não removem a auditoria ou o consentimento.

Os hashes históricos não foram substituídos. Um manifesto adicional encadeia predecessores exatos aos arquivos efetivamente alterados. Listas de texto e testes negativos LF/CRLF continuam ativos. O inventário final distingue conteúdo novo, alterações e representação de finais de linha.

Resultados finais e ambiente: `MATRIZ-E-RESULTADOS.md`. Aplicação e retorno: `APLICACAO-E-ROLLBACK.md`. Fontes: `DOCUMENTACAO-OFICIAL.md`. Pendências reais: `PENDENCIAS-EXTERNAS.md`.
