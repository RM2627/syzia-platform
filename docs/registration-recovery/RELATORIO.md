# SYZIA — Cadastro, confirmação e retomada de ativação

Entrega incremental 070, preparada em 02/11/2026. Base oficial: `3860f6046fbd4c8875df579be279b52247e9f6d8`. Branch local: `syzia-auth-confirmation-recovery`. Sem commit, push, deploy, e-mails reais ou SQL remoto nesta execução.

## Resultado

Implementados: etapa explícita de confirmação; reenvio pelo Supabase Auth existente; recuperação de cadastro interrompido; reaproveitamento de nome/username válidos; callback compatível com o cadastro do backend; retomada da mesma preparação comercial em outro aparelho. O financeiro e a materialização permanecem nos fluxos existentes.

Validação local: 71 testes de servidor/contratos, 9 de banco descartável e 10 cenários de navegador aprovados no resultado acumulado, além de TypeScript e build. Uma execução do cenário móvel de 390 px excedeu o prazo enquanto a aplicação ainda exibia o carregamento inicial; a repetição isolada passou, sem mudar código, limite de espera ou asserções. O registro da falha também acompanha a entrega. Não foi executado gate geral.

**Pronto para revisão e homologação controlada; não homologado em produção.** A entrega real de e-mail e as configurações do Supabase Auth não foram verificadas neste ambiente.

## Causas comprovadas e limites

| Constatação | Evidência | Correção |
| --- | --- | --- |
| Cadastro no servidor usa `implicit`, mas o cliente de `/cadastrar` usa `pkce` com consumo automático do callback. | `server/platform.mjs`, `src/api.ts`; reprodução com a biblioteca instalada: `Not a valid PKCE flow url.` em `auth.initialize()`. | Callback dedicado `/confirmar-email`, consumo explícito e validação oficial de usuário; também aceita o retorno antigo para `/cadastrar`. O modo global PKCE permanece. |
| Após sucesso sem sessão, a tela original mantinha o formulário de cadastro. Não oferecia reenvio específico de confirmação. | `src/acquisition/SelfService.tsx` na base. | Etapa de confirmação, reenvio, entrada e mensagens de resultado incerto. Não solicita outra criação de conta. |
| O convite dependia de `sessionStorage`, indisponível em outro aparelho. | `src/platform-commercial/Activation.tsx` e fluxo de login da base. | Referência durável do convite e hash do e-mail na migration 070, consultável somente pela identidade confirmada elegível. |
| Nome e username já eram enviados ao Auth; a retomada não distinguia adequadamente ausência de perfil de erro de acesso. | Metadados de signup e tratamento de erro na restauração original. | Recuperação server-side; campos válidos reaproveitados; apenas informação ausente/inválida é solicitada; erro de sessão não abre formulário empresarial. |

A causa individual do envio de e-mail que falhou anteriormente **continua não comprovada**. Sem logs de Auth/provedor não é possível afirmar se houve falha SMTP, limite, configuração, criação parcial ou rollback da transação remota. Não foi introduzido transporte novo nem atribuído o problema ao Resend por suposição.

## Comportamento entregue

1. O cadastro valida dados, preserva metadados e, havendo convite válido para aquele endereço, registra apenas o contexto de retorno. O nonce e a prevenção de cadastro duplicado existentes continuam em uso.
2. Sem sessão confirmada, apresenta a etapa de confirmação. Erro incerto nunca vira afirmação de envio ou de criação concluída.
3. O reenvio usa `auth.resend({type:'signup'})`, CAPTCHA configurado e limites duráveis: cinco solicitações por IP e por endereço em dez minutos, com intervalo mínimo de um minuto por endereço. A resposta é neutra para evitar exposição da existência da conta.
4. O link é consumido explicitamente; segredos do callback são removidos da URL. A identidade é conferida por `auth.getUser()`. Tokens de recuperação de senha não são aceitos como confirmação de cadastro.
5. Nome/username registrados têm prioridade sobre metadados. Metadados não conferem papéis ou direitos sobre empresas. Uma sessão antiga revogada não é registrada novamente pela consulta do cadastro.
6. No celular, a pessoa pode concluir a identidade e retomar a preparação. No notebook, se não houver sessão, precisa entrar com sua própria senha. Não se transfere sessão entre aparelhos.
7. Convite, destinatário atual, confirmação de e-mail, sessão, validade, revogação e vínculo são verificados novamente. Com várias preparações elegíveis, a pessoa escolhe explicitamente.
8. A retomada reutiliza `commercial_claim_request` e `commercial_claim_context`, preservando o mesmo snapshot e vínculo. Não concede trial, assinatura, organização operacional ou acesso pago.

## Migration preparada

`supabase/migrations/202611020070_registration_recovery.sql`: necessária porque armazenamento do navegador não permite retomada em outro dispositivo. Cria uma tabela privada com ID de convite, hash do e-mail e data; não armazena token bruto ou e-mail nessa tabela. Habilita RLS/FORCE RLS, revoga acesso direto e concede somente RPCs estritamente necessárias. Funções `SECURITY DEFINER` usam `search_path=''`.

Operações de lembrança/resumo e de retomada reutilizam o bloqueio transacional comercial e a autorização existente. A migration é transacional; duplicação falha sem reaplicar parcialmente. Não é um script de reexecução ou reparação automática.

Migrations anteriores, contratos, preços, trial, gateways, webhooks e reconciliação financeira não foram modificados. Testes não executaram operações financeiras. O inventário acompanha hashes anteriores e novos; `verificacao-pacote.json` registra aplicação e reversão do patch em checkout isolado.

## Pendências e riscos delimitados

- Conferir Auth Redirect URLs, modelo de confirmação, confirmação de e-mail habilitada, CAPTCHA e transporte SMTP do **Supabase Auth**. O transporte Academy/Demo não comprova essa configuração.
- Homologar um único fluxo autorizado com e-mail real após integração; nenhum envio foi feito nesta execução.
- Cadastros anteriores à migration 070 podem não ter contexto de convite salvo. Nesse caso, reabrir o convite original uma vez; não se tenta inferir titularidade ou reconstruir vínculos indiscriminadamente.
- Um link PKCE antigo aberto sem o verifier do navegador de origem pode continuar exigindo login ou novo e-mail. Novos cadastros do backend mantêm o fluxo implicit já utilizado e não dependem daquele verifier.
- Testes SQL executados em PGlite descartável com as estruturas da base, não no Supabase hospedado. As requisições concorrentes foram simuladas; o fixture serializa transações. Não constitui ensaio de carga nem prova de concorrência de PostgreSQL remoto.
- Mantidos limites de IP e infraestrutura existentes. Não foram alteradas regras de confiança em headers de proxy.
- O build emitiu avisos de tamanho de chunks e diretivas `use client` do React Router, sem erro de TypeScript ou compilação.

## Fontes oficiais utilizadas

- https://supabase.com/docs/guides/auth/sessions/pkce-flow
- https://supabase.com/docs/guides/auth/sessions/implicit-flow
- https://supabase.com/docs/reference/javascript/auth-resend
- https://supabase.com/docs/guides/auth/debugging/error-codes
- https://supabase.com/docs/guides/auth/auth-email-templates
- https://supabase.com/docs/guides/auth/general-configuration

As causas de integração acima também foram verificadas no código e na biblioteca efetivamente instalada. Documentação não substitui evidência do envio real pendente.
