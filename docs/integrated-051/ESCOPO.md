# SYZIA 051 — Atualização integrada de trial, reconciliação, checkout e pagamentos

## 1. Objetivo

Implementar uma **atualização incremental** da SYZIA 051, sem reconstruir a plataforma, reunindo quatro melhorias:

**A. Trial automático:** decidir a elegibilidade para sete dias grátis sem aprovação manual rotineira, preservando controles contra abuso.

**B. Reconciliação:** investigar e, quando houver evidência oficial suficiente, recuperar automaticamente uma assinatura já criada no Mercado Pago e atualmente bloqueada por `billing_binding_mismatch`, sem criar outra.

**C. Checkout:** unificar “Confirmar meio de pagamento” e “Realizar assinatura” em uma única ação, **sem modificar o design aprovado**.

**D. Assinatura e faturamento:** auditar a área existente, permitir consulta de informações financeiras e atualização segura de cartão, inclusive após cobrança recusada, **sem reiniciar trial**.

Antes de desenvolver, auditar o que já existe e reutilizar componentes, regras e endpoints. Não duplicar telas ou funcionalidades.

## 2. Base e integridade

Commits de referência:

- `f822028` — checkout seguro e diagnóstico financeiro;
- `f316db5` — integridade Git multiplataforma;
- **`6c33be2` — e-mail do pagador separado do administrativo (base obrigatória).**

Confirmar compatibilidade com `6c33be2` antes de qualquer alteração. Se não for possível comprovar, declarar a limitação e solicitar apenas arquivos técnicos específicos, jamais credenciais ou a pasta privada.

Preservar: arquitetura multiempresa, autenticação, papéis, `billing.manage`, RLS/FORCE RLS, idempotência, locks, trial, snapshots financeiros, webhooks/HMAC, reconciliação, aceites jurídicos, histórico de contratos, migrations anteriores e verificações LF/CRLF. Não alterar hashes históricos para ocultar diferenças.

A correção anterior do `payer_email` deve permanecer: o e-mail validado e confirmado no checkout é enviado ao Mercado Pago, enquanto `actor.email` identifica e autoriza o administrador. Não modificar CPF nem conta administrativa.

## 3. Melhoria A — Elegibilidade automática do trial

### Problema

Hoje o cliente pode depender do superadministrador para aprovar a elegibilidade e registrar manualmente uma verificação de identidade, apesar de já ter fornecido dados na contratação. Isso prejudica o autoatendimento.

### Fluxo desejado

1. Cliente cadastra a empresa, informa os dados necessários e confirma a conta.
2. O **backend** consulta evidências confiáveis de identidade, reservas, concessões e histórico.
3. Se houver evidência suficiente, decide automaticamente a elegibilidade aos sete dias grátis.
4. Se o trial já tiver sido utilizado, não concede outro.
5. Se os dados forem insuficientes ou contraditórios, solicita verificação adicional ou encaminha apenas a exceção ao superadministrador.
6. A interface apresenta mensagens claras: elegível, já utilizado, dados adicionais necessários ou análise excepcional.
7. A elegibilidade **não concede acesso pago nem substitui confirmação financeira**.

### Restrições

- Não reiniciar trial por troca de cartão, e-mail, plano, cancelamento, nova assinatura, exclusão/recriação ou outra empresa ligada à mesma identidade.
- Preservar reservas, concessões, consumo, extensões, datas e histórico de auditoria.
- Não tratar CPF simplesmente digitado como identidade verificada; não inventar aprovação administrativa.
- Prevenir abuso e decisões concorrentes. Manter isolamento por organização e autorização server-side.
- Superadministrador mantém revisão de exceções, não aprovação obrigatória de todo cliente.

## 4. Melhoria B — Recuperação de assinatura existente

### Incidente real

Após a correção do e-mail pagador, foi registrada uma assinatura externa, mas a reconciliação falhou:

```text
state: reconciliation
operation: checkout
operation_state: uncertain
error_code: billing_binding_mismatch
create_started: true
provider_id: presente
trial_reserved: true
```

Auditoria em 14/10/2026 UTC:

```text
14:24:52 — subscription_linked
14:24:52 — reconciliation_error
```

Ocorreram reconciliações posteriores com erro. A interface mostra “Estamos verificando a solicitação”. A existência de `provider_id` **não prova assinatura autorizada**, mas impede tratar o caso como contratação nova.

### Investigação obrigatória

Reproduzir o incidente em testes simulados e identificar a verificação específica que gera `billing_binding_mismatch`. Auditar `provider_id`, `external_reference`, organização, contrato, pagador, vendedor, aplicação, plano, moeda, preço, recorrência, sete dias grátis, data de primeira cobrança, status oficial e snapshot financeiro. Não atribuir o erro ao e-mail, trial ou elegibilidade sem evidência.

### Recuperação segura

1. Quando houver `provider_id` ou criação externa possivelmente iniciada, **consultar a assinatura existente** por API oficial, sem novo POST de criação.
2. Validar referência, organização, vendedor/aplicação, plano, recorrência, preço, trial, status e snapshot.
3. Se todas as evidências forem suficientes, reconciliar transacionalmente e de forma idempotente, inclusive para contratos anteriores à atualização.
4. Liberar acesso somente após confirmação oficial e cumprimento das regras de elegibilidade e acesso.
5. Se houver divergência, busca vazia/múltipla, timeout ou resultado incerto, preservar bloqueio e diagnóstico seguro.

**Proibido:** criar outra assinatura/contrato, alterar `provider_id`, `external_reference` ou chave de idempotência para contornar falhas, cancelar automaticamente, apagar histórico, reiniciar trial, inventar datas, afrouxar validações ou interpretar `billing_reconciliation.succeeded` como aprovação financeira.

Se o motivo do mismatch depender de dados externos não disponíveis, documentar exatamente a pendência e não declarar o caso resolvido.

## 5. Melhoria C — Um único botão no checkout

O checkout atual está **visualmente perfeito e aprovado**. Não modificar layout, cores, tipografia, espaçamentos, campos, resumo, componentes, identidade visual, responsividade ou acessibilidade. Não substituir pelo checkout hospedado.

Eliminar a sequência de duas ações (“Confirmar meio de pagamento” e “Realizar assinatura”). O cliente preenche e confere tudo e clica **uma única vez**.

- Para empresa elegível, botão: **“Iniciar meus 7 dias grátis”**, com preço posterior e condições do trial exibidos previamente.
- Para empresa inelegível, CTA coerente com a contratação paga, sem prometer trial.
- Ao clicar: validar campos e e-mail pagador confirmado → tokenizar com SDK oficial do Mercado Pago → enviar o comando ao backend somente após token válido.
- Exibir processamento e bloquear duplo clique e concorrência entre abas.
- Não considerar tokenização como contratação concluída; confirmar somente após evidência financeira suficiente.
- Em rejeição definitiva, permitir correção segura; em timeout/incerteza, bloquear novo POST e reconciliar.
- Se já existir operação incerta ou assinatura vinculada, não oferecer nova criação.
- Preservar autorização explícita do cliente após mostrar todas as condições comerciais.
- Nunca armazenar cartão completo, CVV ou token em logs, banco ou storage.

Alterar apenas a lógica do botão e estados/mensagens estritamente necessários, não a aparência do checkout.

## 6. Melhoria D — Gestão de assinatura e cartão

### Auditar primeiro

Verificar a área existente **Assinatura e faturamento** e funcionalidades já implementadas: plano, preço, trial, situação, faturas, cobranças, cancelamento, alterações de plano e troca de cartão. Corrigir lacunas; não criar telas ou endpoints duplicados.

### Informações ao cliente autorizado

Mostrar, **somente quando confirmadas**: plano e valor, estado da assinatura, início/fim do trial, próxima cobrança, bandeira e últimos quatro dígitos do cartão (se fornecidos pelo provedor), histórico de faturas/pagamentos, pendências e ação “Alterar meio de pagamento”. Nunca exibir dados completos de cartão, CVV, token, segredos ou informações de outra empresa. Não inventar valores ou datas.

### Troca de cartão

1. Usuário com `billing.manage` acessa a assinatura existente.
2. Usa “Alterar meio de pagamento” e preenche o cartão nos campos seguros do SDK.
3. Backend valida usuário, organização, contrato, assinatura e estado da operação.
4. Usa o procedimento **oficialmente suportado** para atualizar o meio de pagamento da assinatura existente — **não** o endpoint de criação de assinatura.
5. Confirma o resultado no provedor antes de atualizar a interface.
6. Em falha ou incerteza, preserva histórico/vínculo anterior conforme o resultado real e reconcilia sem concorrência.

**Trocar cartão nunca pode criar contrato/assinatura, reservar ou reiniciar trial, alterar sua data original, mudar elegibilidade ou conceder acesso indevido.** O trial pertence ao histórico elegível da empresa/responsável, não ao cartão.

### Cobrança recusada após o trial

Detectar por webhooks validados e consultas oficiais, informar o cliente e permitir atualizar o cartão. Confirmar na documentação se o Mercado Pago faz nova tentativa automaticamente ou exige outra operação; **não presumir que trocar cartão quita uma fatura anterior**. Não realizar cobrança adicional sem autorização nem criar assinatura paralela. Preservar regras existentes de tolerância, suspensão e recuperação de acesso. Se uma ação não for suportada oficialmente, documentar a limitação, sem improvisar.

## 7. Cenários integrados

Cobrir no mínimo:

1. Empresa nova e elegível: avaliação automática → checkout em uma ação → confirmação oficial → acesso correto.
2. Empresa com trial usado: sem novo benefício, CTA e cobrança coerentes.
3. Identidade inconclusiva: análise excepcional, sem aprovação inventada.
4. Assinatura externa existente e válida: reconciliação sem nova criação.
5. `billing_binding_mismatch`: bloqueio até validar todas as condições.
6. Assinatura cancelada, pendente ou criação incerta: sem duplicidade nem acesso indevido.
7. Cartão recusado após trial: atualização na assinatura existente, sem novo trial.
8. Duas abas: um único lease/operação mutante.
9. Administrador e pagador diferentes: `payer_email` confirmado, sem alterar identidade administrativa.
10. Upgrade e rollback: histórico de contratos, trial, pagamentos e aceites preservado.

## 8. Testes obrigatórios

Usar dados fictícios e transporte/SDK simulados. Cobrir:

- Elegibilidade positiva, negativa, inconclusiva; trial anterior; múltiplas empresas; troca de e-mail/cartão/plano; cancelamento; exclusão/recriação; concorrência e exceção administrativa.
- Reconciliação de assinatura válida/histórica, mismatch de referência, vendedor, aplicação, plano, preço, recorrência, trial e pagador; timeout; busca vazia/múltipla; repetição idempotente.
- Ausência de novo POST com `create_started=true` ou `provider_id` presente.
- Checkout com uma ação, falha de tokenização, duplo clique, duas abas, rejeição definitiva, operação incerta, estados e acessibilidade.
- Troca de cartão bem-sucedida, rejeitada, incerta e após trial; nenhuma nova assinatura, reserva, cobrança não autorizada ou acesso indevido.
- Autorização, isolamento multiempresa, RLS/FORCE RLS, HMAC, webhooks, snapshots, proteção de dados, histórico jurídico e migrations históricas.
- Integridade Git LF/CRLF, navegador desktop/mobile, build/typecheck e gate completo vigente.

Não remover testes nem enfraquecer asserts. Registrar resultados reais, ambiente, contagens e limitações. Testes simulados **não comprovam** que a assinatura existente foi recuperada no Mercado Pago real.

## 9. Limites absolutos

- Não reconstruir a SYZIA nem redesenhar o checkout aprovado.
- Não substituir o checkout integrado pelo hospedado.
- Não alterar preços, duração do trial ou módulos fora do escopo.
- Não modificar migrations históricas. Se uma nova migration for indispensável, criar **somente migration incremental**, justificativa, testes de preservação e rollback; **não executar em ambiente real**.
- Não editar, cancelar, apagar ou recriar manualmente o contrato real existente.
- Não fazer pagamentos, novas assinaturas ou chamadas financeiras mutantes reais.
- Não alterar credenciais, dados reais, Supabase, Render ou outros serviços externos.
- Não fazer commit, push, deploy ou publicação.
- Não solicitar `.env`, Access Token, Public Key real, tokens de cartão, CPF, dados de clientes ou dumps privados.
- Não declarar o HTTP 400 ou o `billing_binding_mismatch` resolvidos sem evidência suficiente.
- Não contornar verificações financeiras ou antiabuso para fazer os testes passarem.

## 10. Entrega e critérios de aceitação

Entregar **um único ZIP incremental**, contendo somente arquivos novos/modificados, mais:

1. Diagnóstico das quatro melhorias, distinguindo causa comprovada, hipótese e dependência externa.
2. Inventário de caminhos e hashes SHA-256, com arquivos adicionados e modificados claramente identificados.
3. Matriz de testes, logs/resultados sanitizados de build e gate completo.
4. Documentação das decisões de segurança e da integração entre elegibilidade, contrato, pagamento e trial.
5. Guia de aplicação e rollback com verificação prévia de compatibilidade com `6c33be2`, backup e proteção contra sobreposição indevida.
6. Migration incremental e instruções de rollback **somente se estritamente necessárias**, sem aplicá-las.
7. Pendências de homologação externa para assinatura já vinculada e atualização de cartão.

**Critério final:** a SYZIA deve conceder trial automaticamente **somente quando verificável**, recuperar assinaturas existentes **somente com vínculo oficial válido**, permitir contratação em **uma única ação** sem mudar o design e gerenciar o cartão **sem nova assinatura nem novo trial**.

Se alguma parte depender de informação externa ou não puder ser implementada com segurança, **não simular sucesso**. Entregar o que estiver comprovadamente seguro e registrar exatamente o que falta validar.


## Autorizacoes posteriores

O proprietário autorizou expressamente usar a última base entregue quando o commit não pôde ser comprovado e pediu que a verificação adicional fosse simplificada para o superadministrador. Esta simplificação não autoriza inventar verificação nem conceder acesso sem confirmação financeira.
