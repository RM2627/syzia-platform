> **LEGADO — anterior à revisão de acesso empresarial (026).** Preserve como histórico. Para instalação/login/primeiro acesso atuais, siga `docs/access/upgrade.md` e `docs/access/demo.md` (caminhos relativos à raiz do projeto). Convite por e-mail não é mais o fluxo operacional. Não reaplique migrations antigas.

# Atualização e homologação da revisão VIRELOQ

**Preparado, não executado externamente.** Esta revisão não acessou nem alterou Supabase real. Não há deploy, cobrança, SMTP real nem dados reais nesta entrega. Vídeo cancelado; nova gravação exige nova solicitação expressa após homologação.

## 1. Antes de atualizar

1. Preserve a instalação atual e seu backup/restauração conforme os guias existentes. Use primeiro cópia dedicada à homologação, com dados fictícios.
2. Extraia o ZIP completo em uma pasta nova; preserve `.env`/segredos fora do ZIP e compare sua configuração. Não copie `node_modules`, `dist` ou estado da demo antiga.
3. Confirme que as migrations 001–024 estão aplicadas. Execute `node scripts/verify-historical-migrations.mjs`: compara todos os arquivos históricos com a entrega auditada.
4. Esta entrega acrescenta **somente `202609180025_b2b_invitations.sql`**. Não reaplique 001–024, não use `db reset`, não apague tabelas ou dados.

## 2. Atualização incremental do banco

- Em projeto já gerenciado pelo Supabase CLI e com histórico consistente: confira `supabase migration list`, execute `supabase db push --dry-run`, confira que somente 025 será aplicada e então, pelo proprietário, `supabase db push`. Não aceite um plano que recrie ou reaplique o histórico.
- Se a instalação anterior foi feita pelo SQL Editor sem histórico CLI: abra **apenas** `supabase/migrations/202609180025_b2b_invitations.sql` e execute integralmente no SQL Editor do ambiente dedicado. O arquivo contém `begin`/`commit`. Não misture esse procedimento com `db push` até conciliar o histórico de migrations da instalação.
- Não executar 025 novamente após sucesso. Em erro, a transação reverte; investigue a causa antes de tentar de novo. Não contornar erro removendo constraints/RLS.
- Verifique `organizations.activated_at`, `organization_invitations`, sua policy SELECT e FORCE RLS, grants dos seis RPCs e novos triggers. SQL de inspeção: `scripts/homologation/vireloq-inspect.sql`.
- A ativação preenche empresas existentes com administrador, e novas empresas quando recebem o primeiro administrador ativo. **Não cria trial nem renova assinatura**.

## 3. Auth — entrada B2B e consumidores separados

No ambiente dedicado, configure pela interface/CLI disponível:

- Site URL para a origem exata da aplicação de homologação.
- Redirects para `/atualizar-senha` e `/aceitar-convite` nessa mesma origem, incluindo o parâmetro de convite esperado. Restrinja a allowlist a essas rotas/origens; não permita destinos arbitrários.
- Desabilite o cadastro por e-mail/senha (`auth.email.enable_signup=false` no CLI). Não desabilite inadvertidamente o fluxo de consumidores anônimos: ele depende de `auth.enable_anonymous_sign_ins=true` e das policies existentes. A chave global `auth.enable_signup` precisa ser compatível com esse fluxo; valide ambos os casos com requisições reais.
- Mantenha confirmação de e-mail, política de senha, troca segura de senha, confirmação de alteração de e-mail, limite de tentativas, CAPTCHA/Turnstile e limites Auth/SMTP conforme guias existentes. Não reduza controles para passar no teste.
- Configure SMTP e remetente institucional VIRELOQ somente quando o proprietário disponibilizar provedor/credenciais. Nenhum SMTP foi contratado aqui.
- Configure os templates de convite e recuperação entregues em `supabase/templates/`. Eles usam `.RedirectTo` com `TokenHash` no fragmento, consumido por `verifyOtp` após confirmação do destinatário. Isso evita depender do verificador PKCE de um navegador diferente. O fragmento é removido da barra ao abrir a página e não é enviado no Referer.
- O ID `convite` apenas localiza o convite. O RPC de aceite exige conta elegível autenticada e e-mail correspondente; o ID sozinho não concede acesso. Link de Auth expirado/repetido deve falhar. Convite organizacional tem prazo de sete dias e revogação própria.
- Conta já existente recebe recuperação no próprio endereço; não recebe senha definida pelo gestor. Testar também essa situação em outro navegador/dispositivo e com a política de senha segura do projeto.

Referências oficiais: [inviteUserByEmail](https://supabase.com/docs/reference/javascript/auth-admin-inviteuserbyemail), [templates de e-mail](https://supabase.com/docs/guides/auth/auth-email-templates), [configuração CLI](https://supabase.com/docs/guides/local-development/cli/config), [sessões anônimas](https://supabase.com/docs/guides/auth/auth-anonymous). Confirmar opções disponíveis na versão do ambiente antes de aplicar.

## 4. Backend de convites

1. `npm ci` com Node compatível com o lockfile.
2. Copie `.env.server.example` para `.env.server`, fora do versionamento; preencha URL/credencial **server-only** do ambiente dedicado e `PLATFORM_APP_ORIGIN` exata.
3. `npm run platform:dev` inicia o servidor em **loopback**, porta 8788. Preparação local, não publicação.
4. No frontend, configure somente `VITE_PLATFORM_API_URL` e as chaves públicas já existentes. Nunca prefixe service role/segredos com `VITE_`.
5. Em futura infraestrutura escolhida pelo proprietário, encaminhe a API server-side por HTTPS, aplique limites por IP/conta, tamanho de corpo e logs sem tokens. Não expor o servidor de demo como backend.
6. O endpoint autentica a sessão, verifica autorização atual no banco e reserva envio (cooldown 1 minuto, até 5 tentativas por convite). Não devolve link privilegiado ao gestor. A demo local tem um substituto explícito de caixa de e-mail, inexistente no servidor real.

## 5. Jornada de homologação obrigatória

A. Sem sessão: `/entrar` não oferece cadastro; chamada direta de signup por e-mail falha; consumidor anônimo continua funcionando.
B. Super Admin cria empresa com e-mail de administrador; confira nenhum trial iniciado e ausência de vínculo antes do aceite.
C. Destinatário recebe e-mail, abre em navegador limpo, confirma, define senha, aceita e entra somente na organização correta.
D. Novo login/logout/recuperação reais; confirmação e regras de senha ativas.
E. Admin convida funcionário; repetir como colaborador e atendente próprio; nenhum acesso global ou a organização B.
F. Revogar convite antes de aceitar; expirar; trocar UUID; usar outro e-mail; repetir clique. Todos devem respeitar escopo/idempotência.
G. Suspender/revogar convidador, destinatário ou empresa e repetir com sessão antiga. RPCs devem negar novas operações.
H. Administrador muda papel e suspende membro; convidado antigo não reativa vínculo. Preservar último administrador e limites do plano.
I. Novo e-mail, usuário, funcionário ou empresa não reinicia trial. Repetir elegibilidade, identidade anterior, exceção auditada, expiração e reativação dos guias de trial.
J. Menu Plano e assinatura abre a rota empresarial; administração global permanece separada. Conferir datas reais, plano e dias restantes.
K. Digitar sem salvar em configurações/onboarding, serviço, portfólio, cliente, orçamento, agenda, resposta de atendimento. Alt+Tab/foco e aguardar mais de 15s. Conteúdo deve permanecer. Uma edição externa deve exibir conflito e não sobrescrever silenciosamente.
L. Revogar permissões durante edição; nova operação deve ser negada. Logout/troca de conta/organização não pode carregar rascunho de outro escopo. Falha de rede não é autorização para continuar operando.
M. Repetir todos os testes de RLS, publicação, Storage, orçamento, agenda, manual, comercial, métricas e onboarding existentes com tokens reais de teste. A nova identidade não muda regras de domínio.

## 6. Concorrência

Ferramenta local preparada: `node scripts/test-native.mjs --invitations`. Cria PostgreSQL efêmero, sem TCP/Supabase, com duas conexões independentes. Neste executor, o sistema recusou mapeamento de UID não-root e o teste **não executou**. Rodar como usuário Linux comum com dependência opcional nativa instalada. Repetir no ambiente dedicado usando duas conexões reais; não contar sequências PGlite como concorrência independente.

## 7. Gateway — dependência aberta e bloqueadora de cobrança real

O gateway ainda não foi escolhido. `server/billing/hosted-checkout.mjs` é um **contrato de integração**, validado com adapter/store em memória de teste. Não é um adapter de fornecedor, endpoint produtivo, persistência contratual real ou integração financeira concluída.

Antes de habilitar checkout real são necessários: escolha do provedor, credenciais sandbox/server-side, implementação de autenticidade específica do fornecedor, API de consulta contratual, store durável transacional que reutilize billing existente, vínculo imutável checkout/organização/plano/valor, ordenação/replay/concorrência, cancelamento e reativação conforme capacidades comerciais reais. Eventual mudança SQL será aditiva. O domínio atual de invoices/webhooks aceita exclusivamente `mock`: não alterar constraints para fingir que um evento real foi processado.

Não há fallback automático para mock. Nenhuma rota de retorno ativa assinatura. O catálogo/gestão/trial existentes continuam disponíveis; o CTA explica a indisponibilidade do checkout. Ferramentas de Super Admin continuam para exceções, sem substituir a futura renovação automática.

### Regras preservadas de expiração

As migrations atuais bloqueiam novas operações sujeitas ao plano após expiração/inadimplência; preservam cadastros/histórico. A página publicada não é apagada automaticamente por atraso, e as operações continuam sujeitas aos guardas server-side. Suspensão da própria organização retira a operação pública conforme regras existentes. Organizações legadas sem assinatura seguem a compatibilidade já existente — esta revisão não inventa corte de acesso nem política comercial nova. Confirmar essa política antes do lançamento.

## 8. Depois dos testes

Documentar resultados reais separadamente dos testes locais. Corrigir falhas antes de aprovar cobrança/lançamento. Não produzir vídeo até nova solicitação expressa. Não executar deploy automaticamente.
