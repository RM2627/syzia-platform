# SYZIA — Stripe online, Fase 3

## Estado da entrega

Preparação incremental para publicação controlada, com aquisições bloqueadas por padrão. **Não é uma declaração de homologação online nem autorização para abrir vendas reais.** Nenhum deploy, push, commit, SQL remoto, chamada à API Stripe autenticada ou contratação foi realizado nesta execução.

Base oficial consultada: `main`, `980bedb22f1da437031ad61335d1f574ad4fe794`. Branch local: `syzia-stripe-fase3-online`. A POC da Fase 2.1 permanece separada e preservada. Seu adaptador Endive e suas validações foram reaproveitados; seu servidor local, SQLite, identidades fictícias e concessão própria de capacidades **não** foram incorporados ao servidor de produção. Os 79 testes da POC não foram repetidos.

## Implementado

| Parte | Integração entregue |
|---|---|
| Backend | Módulo Stripe no Node unificado e na mesma porta `PORT`; reconciliação pelo agendador existente |
| Identidade | `Supabase Auth.getUser`, sessão reforçada existente e RPC autenticada com `billing.manage`; organização nunca escolhida por e-mail |
| Contrato | Extensão do registro `private.billing047_contracts`, índice de um contrato corrente por organização, comandos e reservas de trial existentes |
| Acesso | Aplicação pelo motor 047 em `public.billing_subscriptions`, `trial_grants`, claims, pagamentos, auditoria e capacidades existentes; nenhum motor independente de acesso |
| Preços | Três versões ocultas de SYZIA Completa: 5.990/29.940/47.880 centavos, períodos de 1/6/12 meses; integrais, sem parcelamento mensal |
| Limites | Mesmos recursos de software, 8 membros, 100 serviços ativos, 1.000 solicitações/mês; atendimento humano compartilhado continua excluído |
| Checkout | Sessão individual, preços definidos no backend, cartão obrigatório, sete dias somente quando elegível, consentimento às condições registrado |
| Retorno | Consulta autenticada de recursos oficiais; URL de sucesso não é autorização financeira |
| Webhook | `/billing/stripe/notifications`, bytes originais, HMAC/timestamp, limite 64 KiB, envelope mínimo durável e deduplicação |
| Recuperação | Resposta de criação perdida recuperável por evento de sessão + GET oficial, sem novo POST; reconciliação seriada com lease no banco |
| Gestão | Consulta, cancelamento ao fim do período e reativação da renovação antes do encerramento; aquisições desativadas não interrompem gestão de contratos |
| Interface | Selector de provedor, cartões dos três períodos, condições, retomada de sessão aberta e status; verificação somente leitura pelo Super Admin em Planos e assinaturas |
| Mercado Pago | Checkout interno e adaptação financeira originais, HMAC, mapeamentos 047/061/063 e WCS-56983 preservados; seus contratos nunca são processados pela Stripe |

Migration nova: `202611020069_stripe_online.sql`. Necessária para a persistência durável e a autoridade compartilhada no Supabase. Validada **somente em bancos descartáveis locais**. Não modifica os arquivos das migrations anteriores. Não altera inscrições ou contratos remotos.

### Separação de ambientes e bloqueio inicial

Backend: `BILLING_CHECKOUT_MODE=disabled`, `STRIPE_ENABLED=false`, `STRIPE_OPERATIONS_ENABLED=false`. Banco: modo `disabled`, confirmações desativadas, nenhuma organização de teste autorizada. Não há ativação automática ao aplicar código ou migration.

Ativar a comunicação Stripe com o modo ainda `disabled` permite conectividade somente leitura e recebimento assinado. Novas contratações exigem concordância entre configuração do servidor e banco. Uma assinatura de teste só pode liberar acesso numa organização explicitamente autorizada para homologação. Históricos, mapeamentos e recursos dos ambientes não são intercambiáveis.

### Reutilização do motor financeiro

A migration acrescenta um discriminador de provedor e vínculos Stripe ao contrato atual. Mantém o índice de exclusividade, as reservas compartilhadas e as permissões. A restrição de valores passa a aceitar **apenas** as combinações já existentes do Mercado Pago ou as três combinações Stripe autorizadas.

O gatilho 061 conserva sua lógica para Mercado Pago. O service RPC do Mercado Pago filtra contratos Stripe, inclusive em reconciliação. O service RPC Stripe é exclusivo do `service_role`. Os novos objetos privados têm RLS e FORCE RLS, sem acesso direto dos papéis de navegador. A aplicação financeira reutiliza a função central 047; suas únicas adaptações específicas são a identificação correta do provedor no registro do trial e o reconhecimento do trial Stripe já cancelado para o fim do período, sem alterar o comportamento Mercado Pago.

Eventos são indícios: nunca se aplica o status contido no webhook diretamente. São consultados conta, produto, preço, cliente, sessão, assinatura e faturas. O sistema confere moeda, valor, período, quantidade, cartão, metadados e vínculos. Eventos sem contrato local ficam classificados como `unbound`; não são importados como organizações nem bloqueiam a fila.

## Validação e limites

Consulte `TESTES.md` para comandos e evidências. Foram executados testes com PostgreSQL embarcado descartável/PGlite e respostas Stripe simuladas. O acesso ao Supabase remoto, JWT emitido pelo Supabase remoto, entrega online de webhooks e os recursos reais da Stripe **não foram homologados nesta execução**.

O build principal passou. Os testes de interface foram preparados e tentados, mas não executaram suas jornadas: Chromium ausente e download do navegador indisponível/truncado. Isso é uma falha de infraestrutura documentada, não um PASS visual.

## Pendências antes de liberar vendas

1. Aprovar e aplicar a migration e a publicação controlada; configurar os segredos no Render e o webhook de teste. Nada disso foi executado aqui.
2. Conferir a interface no ambiente online em desktop e celular. As capturas e o teste real de navegador continuam pendentes.
3. Homologar Supabase Auth/sessões reais, associação de organização e efeitos nas capacidades com uma organização dedicada de teste.
4. Autorizar separadamente as contratações semestral e anual de teste. A assinatura mensal já informada pelo proprietário não foi recriada e não será adotada automaticamente por uma organização.
5. Comprovar trial, primeira fatura integral e renovação dos três períodos, eventos duplicados, falha e cancelamento no ambiente oficial. O teste mensal anterior não comprova sozinho essa nova persistência Supabase.
6. Fechar os casos ainda não liberados na interface online: troca de modalidade, recontratação após cancelamento definitivo e reabertura de checkout expirado. Eles permanecem bloqueados, sem POST especulativo. A implementação da POC não foi apagada, mas seus comandos de alteração ainda não foram conectados à autoridade SQL operacional.
7. Recuperar administrativamente, com evidência oficial, eventual timeout na criação do Customer sem ID retornado e sem sessão. Não há reenvio automático nem associação por e-mail.
8. Validar o tratamento operacional de estornos/disputas antes de vendas reais; não se presume que `invoice.paid` comprove inexistência de reversão posterior.
9. Aprovar a apresentação pública e os textos comerciais/jurídicos do novo produto. O catálogo público legado e a aquisição comercial existente não foram substituídos nesta publicação de preparação.

**Conclusão:** o código integra o caminho de nova assinatura, persistência, confirmação e gestão básica à infraestrutura existente. Está entregue para revisão e publicação controlada com aquisições bloqueadas. A abertura de contratações reais permanece impedida pelas pendências acima.
