# SYZIA 051 — correção pontual do e-mail pagador

Data: 14/10/2026. Escopo: identidade pagadora no checkout integrado. Validação financeira exclusivamente local, com dados fictícios.

## Resultado e limite da conclusão

A divergência de origem do e-mail foi reproduzida e corrigida: a criação passa a receber o `payer_email` validado e confirmado no formulário. A conta administrativa continua autorizando a contratação; não fornece mais um substituto silencioso para o e-mail pagador.

Isso corrige um defeito demonstrado do fluxo. **Não comprova que ele seja a única causa do HTTP 400 nem que o Mercado Pago tenha aceitado uma criação real.** Nenhuma assinatura externa foi criada nesta rodada. MP-01 continua pendente.

## Base efetivamente utilizada

Foram recuperados o ZIP oficial da 050 identificado como `b30c991` e os complementos entregues da 051: implementação, reconciliação da integridade, segurança de caminhos Windows e integridade Git LF/CRLF. Os **924 arquivos da base resultante coincidiram byte a byte** com o manifesto da última entrega de diagnóstico HTTP 400. Não houve reconstrução funcional.

O acesso ao commit `f316db5` pelo conector retornou 404. Portanto, esta é uma validação da última base disponível, **não uma certificação do conteúdo do commit oficial ou do Render**. O verificador entregue permite comparar a base local do proprietário antes da sobreposição. A comprovação adicional precisa somente do resultado dessa comparação e da identificação completa do commit; arquivos técnicos divergentes serão necessários apenas se aparecerem diferenças. Não enviar `.env`, pasta privada, credenciais, tokens, documentos ou dados de compradores.

O complemento anterior de diagnóstico é um pacote separado, sem mudanças no runtime. Seus 16 testes foram preservados e executados. Um caso foi ajustado porque rejeitava o campo que esta solicitação passou a autorizar. O script e o manifesto histórico usados por esses testes são incluídos como dependências, intactos, para funcionar também onde aquele complemento opcional ainda não foi aplicado. Seus logs antigos não foram copiados.

## Causa comprovada no código

Antes, `SecureCardForm.tsx` coletava `cardholderEmail`, mas extraía somente o token em `getCardFormData()`. A chamada ao backend não continha o e-mail. `subscriptions.mjs` recusava `payer_email` como campo desconhecido e chamava `process()` com `email: actor.email`. O adaptador utilizava esse argumento em `POST /preapproval`.

A reprodução anterior à mudança confirmou, com transporte simulado, a rejeição do campo explícito (`billing_payload_invalid`) e o envio do e-mail administrativo. O teste isolado histórico relatado pelo proprietário é compatível com essa hipótese, mas não substitui a evidência de uma criação real do checkout publicado.

| Etapa | Antes | Depois |
|---|---|---|
| Identidade administrativa | Login SYZIA autoriza e também define o e-mail financeiro | Login autoriza; conta, CPF, vínculos e permissões preservados |
| Formulário | E-mail do titular coletado, descartado na chamada SYZIA | E-mail do pagador editável, exibido e confirmado |
| Sugestão inicial | Sem sugestão explícita neste fluxo | E-mail da própria sessão; aliases internos de acesso não são sugeridos |
| Mudança antes de enviar | Sem vínculo com o e-mail enviado pelo servidor | Desmarca a confirmação; exige revisão do novo valor |
| API SYZIA | Token, organização, plano, chave e elegibilidade | Mesmos campos, mais `payer_email` obrigatório no checkout |
| API Mercado Pago | `payer_email = actor.email` | `payer_email = valor confirmado e validado` |
| Rejeição definitiva | Contrato reutilizável, trial reservado | Mesma regra; nova tentativa pode confirmar outro pagador |
| Operação incerta | Busca e reconciliação oficiais | Mesma regra; e-mail novo não dispara criação nem altera pagador existente |

## Alterações implementadas

- Validador compartilhado, usado no frontend e no backend, sem dependências ou segredos. Aceita endereço ASCII convencional, inclusive `+`, subdomínios e domínio em punycode. Limita tamanho, rejeita controles, espaços internos, nomes de exibição e estruturas inválidas. Remove espaços externos e normaliza somente o domínio para minúsculas; preserva a parte local. Não presume equivalência entre caixas postais.
- `/billing/config`, autenticado e já servido com `Cache-Control: no-store`, fornece uma sugestão do próprio usuário. Ela nunca substitui o valor enviado e não preenche o campo se a pessoa já começou a editá-lo.
- A interface identifica o campo como **E-mail do pagador**, explica a separação da conta SYZIA, mostra o valor antes da confirmação e invalida a confirmação quando ele muda. Durante a tokenização o campo fica somente para leitura. Antes de enviar, compara o e-mail do SDK, o valor atual e a confirmação capturada.
- `/billing/command` exige `payer_email` válido para `checkout`, antes de preparar contrato ou reservar trial. Campos inesperados continuam proibidos. A tentativa de alterar o pagador por comandos de cancelamento, mudança de plano ou troca de cartão é rejeitada.
- `mercado-pago.mjs`, `http.mjs`, `diagnostics.mjs` e `checkout-api.ts` foram auditados e permanecem intactos: o defeito estava na passagem do argumento. Não houve alteração em `notification_url`, `back_url`, `reason`, `status`, referência externa ou composição do payload do provedor.

## Política para tentativas e concorrência

O e-mail é uma entrada transitória de criação, não um identificador de autorização, propriedade de contrato ou elegibilidade. Não é gravado em tabelas, logs, localStorage ou sessionStorage pela correção.

1. Sem assinatura vinculada e sem criação externa iniciada: o comando autenticado prepara/reutiliza o contrato, obtém o lease e pode usar o e-mail confirmado no único POST permitido.
2. Rejeição definitiva tratada pela 051: conserva o contrato e a reserva. Uma ação explícita posterior, com token novo e confirmação atual, pode corrigir o e-mail. Não há retry automático de criação.
3. Timeout, resultado incerto ou `create_started=true`: prevalece a busca oficial pela referência imutável. O novo e-mail recebido de uma aba antiga não altera a assinatura nem autoriza novo POST. Busca vazia mantém a pendência.
4. Contrato já vinculado: o checkout atrasado consulta o vínculo existente. Não aplica o e-mail recebido nem afirma que o pagador foi alterado.
5. Duas abas: somente o detentor do lease pode criar. A outra acompanha a confirmação existente. Chave de idempotência, referência, empresa e reserva seguem as regras anteriores.

A aceitação real de um retry corrigido sob a mesma chave de idempotência deve ser confirmada na homologação do provedor. Não se alterou a chave para contornar um resultado incerto.

## Segurança preservada

Não há lookup de contratos por e-mail. Permanecem: autorização server-side, `billing.manage`, escopo empresarial, locks, RLS/FORCE RLS, trial por identidade administrativa verificada, vendedor/aplicação/plano, consultas oficiais, HMAC, snapshots e confirmação financeira antes de conceder acesso. Digitar um e-mail não comprova propriedade da caixa postal nem autorização financeira; esta depende do meio de pagamento e da confirmação oficial.

As **47 migrations** existentes permanecem byte a byte intactas; nenhuma nova migration. Preços, sete dias grátis, tolerância, cancelamento, upgrades/downgrades e demais módulos não foram modificados. Dados administrativos, inclusive os identificadores do responsável, foram comparados antes/depois nos testes e preservados.

Os cinco registros alterados no manifesto de hashes correspondem exclusivamente a arquivos históricos efetivamente alterados nesta autorização. Seus predecessores oficiais não foram substituídos. O allowlist LF/CRLF, seu hash independente e os testes negativos permanecem intactos.

## Documentação oficial consultada

Consulta em 14/10/2026. Links e comparação detalhada em `DOCUMENTACAO-OFICIAL.md`. A API documenta o e-mail do assinante separadamente das credenciais da integração. Interpretar esse campo como o e-mail confirmado pelo pagador é compatível com o contrato documentado; a documentação não conhece os papéis administrativos internos da SYZIA. Não foi inferida uma exigência de igualdade com o login da aplicação.

**Validação local concluída:** 39/39 testes específicos, 14/14 de checkout no navegador, 16/16 do diagnóstico anterior, 8/8 de integridade LF/CRLF, build/typecheck e 30/30 etapas do gate. Os resultados executados estão em `MATRIZ-E-RESULTADOS.md`. O procedimento de aplicação, limites e rollback estão em `APLICACAO-E-ROLLBACK.md`.

Nenhum deploy, commit, push, SQL no Supabase, alteração de credenciais, pagamento real ou nova assinatura externa foi executado.
