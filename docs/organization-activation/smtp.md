# Instruções administrativas por e-mail

O e-mail é **somente entrega**. A conta Auth, o profile e o membership já existem. O destinatário usa código da empresa + username + código temporário em `/entrar` e escolhe a própria senha. Não há convite Auth, magic link, signup ou autenticação pelo endereço de contato.

## Configuração a ser feita pelo proprietário

No `.env.server` já existente, acrescente os parâmetros do `.env.server.example`:

| Parâmetro | Finalidade |
|---|---|
| `ACCESS_MAIL_ENABLED` | `false` por padrão; `true` somente após configurar seu provedor. |
| `ACCESS_SMTP_HOST` | Servidor SMTP fornecido pelo seu provedor. |
| `ACCESS_SMTP_PORT` | `587` com STARTTLS obrigatório ou `465` com TLS desde a conexão. |
| `ACCESS_SMTP_USER` | Usuário SMTP do provedor. |
| `ACCESS_SMTP_PASSWORD` | Segredo SMTP, somente no servidor. |
| `ACCESS_MAIL_FROM` | Remetente autorizado pelo provedor. |
| `PLATFORM_APP_ORIGIN` | Origem oficial da instalação; o link usa `/entrar`, sem token em URL. |

Não coloque esses valores em variáveis `VITE_*`, frontend, repositório ou ZIP. Não foi escolhido, contratado, configurado ou ativado nenhum serviço. Nenhuma credencial foi inventada.

Confirme no provedor o remetente autorizado, autenticação do domínio conforme suas instruções (SPF/DKIM/DMARC quando aplicável), sandbox/lista de destinatários permitidos e limites de envio. Essas ações externas serão executadas pelo proprietário. Reinicie a Platform API após alterar a configuração. O processo não testa conexão SMTP automaticamente na inicialização.

A configuração SMTP da **Platform API** é independente do “Custom SMTP” do Supabase Auth. Configurar apenas Custom SMTP no painel Supabase não preenche as variáveis acima. O provider Email/Auth necessário ao login existente deve continuar configurado; não reative convite por e-mail para este fluxo.

## Segurança e significado do resultado

TLS é obrigatório, os certificados são verificados, logs de protocolo/conteúdo ficam desativados e anexos/leituras externas não são utilizados. O servidor recebe o destinatário exclusivamente do cadastro autorizado; o navegador não escolhe um destinatário alternativo para reenvio. A implementação usa o transporte documentado em [Nodemailer SMTP](https://nodemailer.com/smtp).

“Envio aceito” significa que o servidor SMTP aceitou a mensagem. Não comprova entrega na caixa de entrada, leitura ou propriedade do e-mail. `email_not_configured`, `email_delivery_failed`, `email_rate_limited` e `email_temporary_failure` são códigos seguros; o payload do provedor nunca vai para o navegador.

O conteúdo inclui empresa, código empresarial estável, username, código temporário, validade em UTC e instrução para criar senha. Nenhum link contém segredo. O código está em claro apenas durante a emissão e no canal escolhido para entrega; somente seu hash é persistido na aplicação. Não há fila persistente contendo códigos em claro.

## Falha, reenvio e validade

A criação do acesso tem sucesso mesmo quando SMTP falha. A interface informa a falha e permite copiar instruções. Em Pessoas e acessos, um administrador pendente oferece Reenviar instruções; o operador confirma que o código anterior será invalidado.

O reenvio emite nova geração, respeita a política de validade existente (48 horas por padrão) e mantém o mesmo Auth/profile/membership/organização. Há intervalo de 60 segundos e limite de cinco tentativas por hora por acesso, além dos limites do gateway. Conta desativada, empresa suspensa, identidade já ativa ou operador não autorizado não podem usar essa ação de reenvio pendente.

Se a emissão anterior expirou, o operador autorizado pode emitir nova instrução; o código expirado nunca volta a funcionar. O primeiro administrador e identidades legadas compartilhadas continuam sujeitos às restrições de recuperação da 026. Erro de reenvio não deixa na tela o sucesso de uma tentativa anterior.

Se houver interrupção entre envio e confirmação no banco, o estado será entrega não confirmada. Verifique antes de reenviar; jamais presumir que uma mensagem não foi recebida apenas porque a resposta se perdeu. Um reenvio posterior invalida a geração anterior.

## Validação externa pendente

Os testes locais exercitam transporte/adapters controlados e serialização real da mensagem em memória. **Nenhum e-mail real foi enviado; SMTP real NÃO está homologado.** O proprietário deve validar recebimento, spam, limites e comportamento de falha no ambiente dedicado.
