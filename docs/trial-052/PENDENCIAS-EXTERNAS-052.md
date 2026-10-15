# Pendências externas — SYZIA 052

1. **Assinatura real existente:** depois da aplicação coordenada autorizada, confirmar a recuperação pelo mesmo contrato e `provider_id`, sem outro POST. A evidência de ausência de `version` foi fornecida pelo proprietário; esta rodada não consultou ou alterou a assinatura real.
2. **Contrato documental do Mercado Pago:** confirmar em quais modalidades `version` pode ser omitido e as garantias de `last_modified` e leitura após troca de cartão. A documentação consultada exibe o campo e exemplos, mas não estabelece presença universal. O código mantém bloqueio conservador diante de informações contraditórias.
3. **Demais validações financeiras:** a correção do campo ausente não comprova que trial, primeira cobrança, pagador, plano, vendedor ou aplicação do contrato real estejam compatíveis. Novo diagnóstico deve ser tratado especificamente.
4. **MP-01:** permanece pendente a homologação externa efetiva da entrega de notificações de Assinaturas. Simulação, HTTP 200 e reconciliação não a substituem. HMAC e receptor foram preservados.
5. **Supabase/PostgreSQL real:** confirmar aplicação única da 053, grants, RLS/FORCE RLS e concorrência de sessões reais na homologação posterior. PGlite e as transações serializadas dos fixtures não demonstram concorrência PostgreSQL nativa em produção.
6. **Windows nativo:** a execução desta rodada ocorreu em Linux. Há validação de LF/CRLF e caminhos portáteis; não se declara execução nativa no Windows.
7. **Identidade e abuso:** CPF matematicamente válido não prova titularidade. São preservados os vínculos e o histórico conhecidos; não há garantia antifraude absoluta contra documentos de terceiros.

Nenhuma dessas pendências autoriza iniciar cobrança, modificar serviços externos, criar assinaturas de teste externas, realizar deploy ou aplicar SQL automaticamente.
