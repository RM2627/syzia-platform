# Pendências externas — e-mail pagador 051

Estas verificações não foram executadas. Devem ocorrer apenas em homologação posteriormente autorizada pelo proprietário, sem cartão real ou cobrança real.

1. **Base oficial:** confirmar o conteúdo de `f316db5` com o verificador entregue. Foi comprovada a referência disponível de 924 arquivos, mas o commit retornou 404 pelo conector. Solicitação mínima: resultado da conferência, SHA completo do commit e, somente se necessário, os arquivos técnicos divergentes.
2. **Criação aceita pelo Mercado Pago:** usando o fluxo integrado, confirmar que o e-mail revisado corresponde ao comprador de teste adequado à modalidade Assinaturas. O e-mail administrativo e o CPF administrativo permanecem como estavam. Não criar outro usuário SYZIA nem alterar essas identidades para testar.
3. **Compatibilidade do ambiente financeiro:** confirmar localmente, sem compartilhar valores secretos, se aplicação, vendedor, plano, credenciais e tokenização pertencem ao mesmo cenário de teste. Não presumir regras de Checkout Pro/Bricks para Assinaturas.
4. **Resultado incerto:** se o contrato estiver em reconciliação ou com criação iniciada, apenas consultar/reconciliar a mesma operação. Não limpar flags, excluir contrato, trocar chave ou disparar outro POST para tentar outro e-mail. Uma recusa definitiva pode permitir nova confirmação pela própria interface, mantendo a reserva.
5. **Retry após recusa definitiva:** validar a aceitação real da correção de e-mail com token novo e a chave de idempotência preservada. Se houver conflito, consultar o suporte do Mercado Pago antes de alterar a política; não inventar nova chave para evitar a reconciliação.
6. **Trial e acesso:** conferir recurso oficial, sete dias de período grátis, data da próxima cobrança e vínculo ao contrato correto. Status de retorno no navegador, contador de reconciliação ou e-mail coincidente não comprovam autorização.
7. **MP-01:** permanece aberta até entrega de evento real de Assinaturas, recebimento, consulta do recurso oficial, vínculo validado e processamento idempotente. Um simulador com ID fictício não resolve essa pendência.
8. **Windows:** executar os comandos do guia sobre a base oficial local. Nesta rodada houve execução Linux e testes de equivalência LF/CRLF; não houve execução Windows nativa nem acesso ao checkout Git oficial.

Para uma verificação posterior, registre somente horário, código local, etapa, status HTTP, identificador de correlação e conclusão de cada verificação. Não compartilhe body de request/response, HAR, token, chave, documento, e-mail completo ou screenshots com dados pessoais. Qualquer evidência adicional do provider deve ser tratada pelo proprietário de forma privada e com minimização.

**HTTP 400: resolução externa não comprovada. MP-01: pendente. Nenhuma autorização de produção é concedida por esta entrega.**
