# SYZIA 051 — pendências externas

1. **MP-01 permanece aberta.** É necessária evidência de evento real de Assinaturas, com autenticação e recurso consultado oficialmente. Simulador com ID fictício, reconciliador e fixtures não homologam entrega de webhook.
2. Confirmar com o Mercado Pago a taxonomia específica de erros de `/preapproval` para cartão, dados e comprador. A 051 usa HTTP/etapa e não inventa causa específica a partir de mensagem livre ou tabela de outro produto.
3. Investigar a recusa antiga com os elementos efetivamente disponíveis ao proprietário; os eventos históricos genéricos não contêm o status HTTP que a 051 passa a conservar. Não modificar manualmente o contrato real nem limpar a reserva do trial.
4. Homologar a combinação comprador/vendedor/aplicação/site/ambiente. O `payer_email` usado pelo backend é o e-mail do usuário autenticado na SYZIA. O campo do SDK não substitui essa identidade. Isso é um ponto de verificação, não uma causa comprovada da recusa.
5. Confirmar trial real de sete dias, vínculo do cartão, primeira cobrança e `next_payment_date`. A divergência com data igual à criação continua bloqueada por `billing_trial_mismatch`.
6. Homologar SDK/iframes, máscara, tokenização e leitores de tela reais. Os testes locais usam substituto explícito do SDK e verificam layout, callbacks, foco, campos/erros, payload e estados. Não houve validação de cartão externo.
7. Aplicar e verificar a migration 051 em Supabase/PostgreSQL de homologação posteriormente autorizado, incluindo concorrência multiprocesso e rollback operacional. O teste desta entrega foi PGlite + requisições assíncronas com lease, sem banco real.
8. Identificação jurídica/publicação dos documentos continuam sujeitas às confirmações e aprovações da 050. Conteúdo, ferramentas de versionamento, aceites e restrições de privacidade não foram alterados.

Nenhuma etapa externa acima foi executada. Não houve deploy, push, publicação, assinatura/cobrança externa, uso de credenciais reais ou mudança em serviços externos. A implementação local da 051 está concluída; não é autorização de lançamento.
