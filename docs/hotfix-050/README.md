# SYZIA — Hotfix 050

Base conferida: 049 + Sharp + hotfix consolidado + MP-01. Os sete arquivos do ZIP MP-01 entregue foram comparados byte a byte com a base de trabalho. O usuário informou o commit publicado `786183f`; o repositório não ficou acessível nesta sessão, portanto não se declara comparação com o HEAD remoto.

## Resultado e limite da entrega

- Correção implementada: inicialização de billing, diagnóstico do estado desligado e observação autenticada de notificações, sem efeitos financeiros.
- Termos e Política revisados em arquivos separados nesta pasta. **São textos para aprovação; não substituem as versões registradas no banco.** A integração definitiva está pendente da autorização descrita em `REVISAO-JURIDICA-E-APROVACAO.md` e da identificação do fornecedor/controlador.
- A interface de aceite recebeu somente a remoção da frase fixa sobre homologação. Continua consultando e exibindo o documento efetivamente registrado. Não foi criada uma sobreposição de contrato no frontend.
- Não há migration nova, alterações de autenticação, regras financeiras ou schema. A migration 050 de checklist, já existente na base, permanece intacta e não deve ser confundida com o nome desta rodada.
- MP-01 permanece **PENDENTE DE HOMOLOGAÇÃO EXTERNA**. Não houve deploy, configuração remota, assinatura externa, cobrança nem uso de credenciais reais.

## Por que ocorria HTTP 503

`billingRuntime` só construía `MercadoPagoSubscriptions` quando `MERCADO_PAGO_ENABLED` era exatamente `true`. Em `false`, repassava `gateway=null` ao motor. `webhook()` chamava `ready()` e recebia `billing_credentials_missing` antes de verificar HMAC ou consultar o provider. A presença das variáveis e `BILLING_PROVIDER=mercado_pago` não mudava esse caminho.

Agora o modo desligado retorna `billing_disabled`. Credenciais realmente ausentes continuam produzindo erro de configuração quando se solicita uma integração ativa.

## Modos e configuração

| ENABLED | NOTIFICATION_MODE | Resultado |
|---|---|---|
| `false` | ausente ou `disabled` | Billing e receptor desligados; HTTP 503 `billing_disabled` |
| `false` | `observe` | Apenas HMAC, consultas oficiais e verificação do vínculo local; nenhum efeito financeiro |
| `true` | ausente ou `disabled` | Motor comercial anterior, receptor e reconciliador anteriores |
| `true` | `observe` | Configuração incompatível recusada na inicialização |
| qualquer | valor desconhecido | Configuração recusada |

`disabled` é o padrão da nova variável. Quando o motor comercial está habilitado, essa variável não desliga seu receptor normal; ela seleciona apenas a exceção de observação com o motor desligado.

Para futura observação, exclusivamente por decisão do proprietário, manter `BILLING_PROVIDER=mercado_pago` e `MERCADO_PAGO_ENABLED=false`; definir `MERCADO_PAGO_NOTIFICATION_MODE=observe`. A chave de assinatura HMAC aplicável, Access Token, identificadores de aplicação/vendedor, URL de notificação, origem e demais variáveis financeiras existentes precisam ser válidos e coerentes. O exemplo entregue contém somente campos vazios. Não substituir arquivos privados pelo exemplo.

Nesse modo HMAC é obrigatório, inclusive se `MERCADO_PAGO_NOTIFICATION_AUTH` estiver em `resource_lookup`. Não remover, trocar ou inventar o segredo para conseguir um teste verde. Se o mecanismo efetivo de Assinaturas não disponibilizar a assinatura esperada, confirmar o contrato com o Mercado Pago; não reduzir a proteção.

## Efeitos e respostas

O observador usa os métodos de consulta e a validação de snapshot já existentes. Só permite GET no transporte do provider e `billing047_service/get` no banco. Essa RPC adquire os locks já existentes, mas não altera registros. Não importa contratos externos, não chama `prepare`, `lease`, `bind`, `apply`, `start` ou `error`, não finaliza comandos pendentes e não habilita o reconciliador. `/billing/config`, `/billing/command`, `/billing/status`, `process()` e `reconcile()` continuam recusados com 503.

| Situação | Resposta |
|---|---|
| HMAC ausente/inválido | 401, antes de consulta externa |
| Corpo inválido ou evento não suportado no observador | 400 |
| Corpo maior que 16 KiB | 413 |
| ID oficial não encontrado, como o fictício `123456` | 502 `billing_resource_missing`, caso a consulta retorne 404 |
| Assinatura oficial sem vínculo local conhecido | 409 `billing_binding_missing` ou 400 de divergência, conforme o caso |
| Recurso ou vínculo divergente | 400/502; nenhuma aplicação |
| Provider indisponível, resposta inválida ou timeout | 502 |
| Consulta do vínculo local indisponível | 503 `billing_observation_unavailable` |
| Assinatura e vínculo validados | 200 `{ "accepted": true, "mode": "observe", "applied": false }` |

O 200 do observador significa **observação validada sem aplicação**. Não significa pagamento, trial, acesso liberado ou MP-01 aprovada. Eventos repetidos e fora de ordem são consultados novamente e não produzem efeitos financeiros. Não há cache de sucesso, bypass pelo ID do simulador ou confirmação por `status` informado no corpo.

Este modo é exclusivo de homologação e não é apropriado para manter a cobrança de clientes ativos. O ACK de observação não cria uma fila para aplicação posterior. Eventuais estados a recuperar exigem a reconciliação normal quando houver autorização para operar o motor comercial; não alternar os modos para cobrar ou regularizar clientes nesta rodada.

São atendidos os tópicos já suportados de assinatura, fatura autorizada e pagamento. Um pagamento precisa pertencer a uma fatura da assinatura vinculada. Eventos de plano, formatos IPN e contratos novos não foram adicionados. O modo comercial preserva integralmente seu comportamento anterior.

O log de observação registra apenas evento fixo, modo, `applied=false` e identificador aleatório da requisição local. Falhas mantêm códigos saneados. Não registra corpo, URLs com query, IDs financeiros, documentos, tokens, assinatura HMAC ou segredos. Não foi criada auditoria financeira persistente para observações; preservar o log técnico de homologação é uma operação do proprietário.

## Infraestrutura e MP-01

O Render documenta suspensão da instância gratuita após 15 minutos de inatividade e retomada em aproximadamente um minuto. O Mercado Pago documenta espera de 22 segundos pela confirmação HTTP. Essa diferença explica uma hipótese tecnicamente compatível com o timeout inicial informado; não constitui medição ou prova do tempo de despertar daquela instância. O 503 posterior é uma falha distinta, reproduzida no código.

Não foi contratado outro plano, alterado timeout remoto ou criado ping para impedir a suspensão. Antes de um teste manual, o proprietário pode conferir `/health`, aguardando resposta normal, e então observar o resultado da notificação. Isso ajuda a separar cold start do erro da aplicação, mas não garante disponibilidade contínua. `/health` apenas indica que o processo responde: não valida credenciais, HMAC, conexão financeira ou MP-01.

O processamento HTTP permanece síncrono. Cada consulta do adaptador tem timeout de 10 segundos, mas várias consultas sequenciais e espera do banco podem ultrapassar o prazo de confirmação do provider. Não se promete limite total inferior a 22 segundos. Não foi acrescentada fila nem ACK antecipado sem persistência; essa mudança seria outra decisão de arquitetura. A política de retentativas do provider não substitui a necessidade de homologar o ambiente.

O reconciliador comercial está preservado, inclusive seu caráter potencialmente modificador ao finalizar operações antes autorizadas. Fica desligado no observador. Não executar `billing:reconcile` em ambiente real sob a suposição de que seja apenas leitura. Ele continua sendo recuperação, não prova da entrega dos Webhooks.

## Aplicação posterior e rollback

1. Guardar cópia da base e dos arquivos que serão substituídos, fora do repositório de produção.
2. Extrair o ZIP em diretório temporário e executar o verificador de sobreposição indicado no relatório. Ele deve confirmar a compatibilidade dos arquivos que serão alterados; divergência exige comparação, não sobrescrita forçada.
3. Sobrepor somente os arquivos da entrega na raiz de `foundation`, preservando os demais e os arquivos privados.
4. Executar `npm ci`, `npm run test:hotfix:050`, `npm run build` e `npm run test:current-gate` localmente. O comando do navegador requer Chromium instalado ou `FOUNDATION_CHROMIUM_PATH`, conforme o guia existente.
5. Manter os modos desligados até a decisão de configuração externa. Este guia não executa nem autoriza deploy automático. Atenção a repositórios com publicação automática ao fazer push.

Não aplicar migrations nesta rodada. O rollback restaura os arquivos substituídos e remove apenas as adições desta entrega, conforme o inventário; nenhuma reversão de dados é necessária. Reverter o runtime também remove o novo modo de observação. Não remover o hotfix HMAC anterior.

## Fontes oficiais consultadas em 13/10/2026

- [Mercado Pago — Webhooks de Assinaturas](https://www.mercadopago.com.br/developers/pt/docs/subscriptions/additional-content/your-integrations/notifications/webhooks): tópicos, assinatura, janela de confirmação e ressalva sobre o método de configuração de Assinaturas. O documento ainda restringe a configuração geral por “Suas integrações” para Assinaturas; o simulador não confirma a entrega real dessa integração.
- [Render — instâncias gratuitas](https://render.com/docs/free): suspensão por inatividade e retomada.
- [Investigação anterior do projeto](../billing-mp01/README.md): contratos não comprovados e regras preservadas.
