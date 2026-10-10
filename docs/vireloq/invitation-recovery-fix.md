> **LEGADO — anterior à revisão de acesso empresarial (026).** Preserve como histórico. Para instalação/login/primeiro acesso atuais, siga `docs/access/upgrade.md` e `docs/access/demo.md` (caminhos relativos à raiz do projeto). Convite por e-mail não é mais o fluxo operacional. Não reaplique migrations antigas.

# Correção de homologação — convites e primeiro acesso

19/09/2026 — correção pontual sobre a última entrega VIRELOQ.

**Entregue:** arquivos corrigidos, testes e este guia. **Nenhuma migration 026. As migrations 001–025 não foram alteradas.** Branding, planos, trial e regras de vínculo permanecem preservados. Vídeo continua CANCELADO.

## 1. Causa-raiz e limites do diagnóstico

Problemas confirmados no código:

1. O reenvio limpava `error`, mas mantinha `notice` de uma tentativa anterior. Havia como exibir sucesso antigo junto de falha atual.
2. A lista não era recarregada quando o reenvio falhava. O banco já podia registrar `failed`, enquanto a tela continuava mostrando o `sent` anterior. A legenda também tratava aceitação pelo serviço de e-mail como garantia de entrega.
3. Três camadas descartavam informação: o orquestrador reduzia falhas a `invitation_delivery_failed`, o HTTP retornava `invitation_not_sent` para tudo e o frontend descartava o corpo de erro.
4. A rota de senha ignorava `error`, `error_code` e `error_description` na query/fragmento. Uma sessão existente podia fazer parecer que um link inválido ainda permitia definir senha.
5. Links padrão de convite/recuperação emitidos pelo backend podem retornar um callback implícito com tokens no fragmento. O frontend usa PKCE. O SDK instalado rejeita automaticamente essa combinação; o fluxo anterior não tratava esse retorno explicitamente. Os templates com `TokenHash` já entregues evitavam essa incompatibilidade quando corretamente configurados, mas não eram o único formato possível no ambiente.
6. A demo local rejeitava SELECT com lista de colunas, utilizado pela lista de convites. Ela agora aceita projeções validadas contra as colunas existentes, mantendo execução como o usuário/RLS. Isso corrige a verificação local, sem mudar PostgREST real.

O uso de `inviteUserByEmail` seguido de recuperação **somente quando o Auth confirma conta já existente** foi preservado. O problema não é a recuperação ser intrinsecamente inválida: era necessário completar o tratamento do callback, dos erros e do estado de envio. A recuperação usa o mesmo endereço e o mesmo ID de convite; não cria vínculo por si só.

O relato de `otp_expired` é compatível com expiração ou consumo do link. Abrir um link padrão pode consumir a prova no Supabase antes de chegar ao redirect; `127.0.0.1` no celular aponta para o próprio celular. Sem os logs daquela tentativa, não afirmamos se o consumo ocorreu no celular, em outro acesso, em scanner de e-mail ou por prazo expirado.

**Não é possível atribuir todas as falhas reais à aplicação.** O proprietário relatou pelo menos um envio externo bem-sucedido. Essa evidência foi fornecida pelo proprietário; o ambiente Work não enviou e-mail nem se conectou ao Supabase real nesta correção.

## 2. Comportamento final

### Envio/reenvio

1. O servidor valida a sessão pelo Auth.
2. O RPC existente verifica autorização atual, organização, convidador, estado, validade e limites; reserva o envio sob lock.
3. Tenta convite Auth. Para `email_exists`/`user_already_exists`, solicita nova recuperação para **o mesmo e-mail**, mantendo `/aceitar-convite?convite=<mesmo-id>`.
4. Registra `sent` ou `failed` no lease existente. Se a confirmação no banco falhar após o envio, informa resultado não confirmado, sem reenviar automaticamente.
5. Nenhuma membership ou trial é criado nessa etapa. O destinatário precisa validar a nova prova, definir senha e passar pelo `foundation_accept_invitation` original.

Um erro genérico do provedor, HTTP 422 desconhecido ou falha SMTP não dispara recuperação indiscriminadamente. Não são usados `generateLink` exposto ao gestor, senha escolhida pelo administrador ou confirmação administrativa de e-mail.

O reenvio preserva o limite existente: **um minuto entre tentativas e cinco reservas de envio por convite**, inclusive tentativas que falhem externamente. A correção não zera contadores. Ao atingir cinco, revisar SMTP/logs; se necessário, gestor autorizado revoga o convite e emite outro para a mesma organização pela interface. Isso gera novo convite auditado, não nova empresa/trial e não reativa vínculo suspenso. Não editar contadores diretamente no banco.

### Primeiro acesso

- As duas rotas de senha processam seu callback explicitamente, após o destinatário clicar em continuar. As demais rotas mantêm seu comportamento de Auth.
- São tratados `token_hash` (`invite`/`recovery`), callback implícito do template padrão e código PKCE da recuperação iniciada pelo próprio navegador.
- Erros na URL têm prioridade mesmo se houver sessão anterior. Mostra: **“Este link expirou ou não é mais válido. Solicite novas instruções.”** Sem formulário de senha.
- UUID sozinho, sessão antiga ou código PKCE sem verificador não substituem a prova do link.
- Segredos de callback são removidos do endereço; não são enviados em mensagens de erro ou logs. O SDK continua responsável pela sessão autenticada.
- Antes de alterar a senha, o usuário é revalidado e deve corresponder à conta confirmada naquele fluxo. O aceite no banco continua validando e-mail, convite, organização e convidador.
- Se o convite interno estiver revogado/expirado, uma nova recuperação de Auth não o torna válido.

### Mensagens e `delivery_state`

| Situação persistida | Apresentação |
|---|---|
| `not_sent` | Nenhum envio confirmado |
| `sending` | Envio solicitado; confirmação pendente |
| `sent` | Envio anterior aceito pelo serviço de e-mail |
| `failed` | Última tentativa de envio falhou |

Ao iniciar cada ação, são limpos erro, sucesso e link fictício anteriores. Após qualquer resultado, a lista é recarregada. Uma consulta antiga não pode sobrescrever o feedback de uma nova tentativa. Se a lista não puder ser atualizada, a tela informa que a situação precisa de confirmação.

Falhas que ocorrem **antes da reserva**, como cooldown, não alteram o último envio persistido. Nesse caso, a tentativa atual aparece como não concluída e um eventual envio anterior é identificado como anterior. Após recarregar a página, o banco conserva o histórico da última reserva efetiva; a legenda nunca afirma que um novo reenvio bloqueado aconteceu. Não há promessa de chegada à caixa de entrada: `sent` significa aceitação pelo serviço, não confirmação de leitura/entrega.

## 3. Códigos seguros

| Código | HTTP | Significado |
|---|---:|---|
| `invitation_invalid` | 400 | Pedido inválido |
| `access_denied` | 403 | Sessão/identidade inadequada |
| `invitation_not_available` | 403 | Convite indisponível ou autorização alterada; sem revelar convite de outra organização |
| `invitation_expired` | 410 | Convite interno expirado, confirmado em leitura autorizada |
| `invitation_revoked` | 410 | Convite interno revogado, confirmado em leitura autorizada |
| `invitation_cooldown` | 429 | Bloqueio interno entre tentativas |
| `invitation_attempt_limit` | 429 | Limite interno de cinco reservas atingido |
| `invitation_rate_limited` | 429 | Limite informado pelo Auth/provedor |
| `email_recipient_not_authorized` | 422 | Destinatário recusado pelo serviço de e-mail |
| `email_delivery_failed` | 502 | Falha do endpoint de envio do convite |
| `recovery_delivery_failed` | 502 | Falha ao solicitar novas instruções para conta existente |
| `temporary_delivery_failure` | 503 | Transporte/tempo esgotado/falha inesperada |
| `invitation_delivery_unavailable` | 503 | Configuração incompatível, provider desabilitado ou desafio exigido pelo Auth |
| `invitation_delivery_unconfirmed` | 503 | Envio pode ter ocorrido, mas finalização não foi confirmada |

As mensagens são traduzidas para português. O HTTP retorna apenas código permitido e `request_id`. O log da Platform API contém evento, referência, código e etapa (`authentication`, `claim`, `invite`, `recovery`, `finalize`); não contém e-mail, token, service role, link ou payload bruto do provedor. Erro desconhecido é sanitizado.

A diferenciação de expirado/revogado/limite total consulta apenas os campos necessários **com o JWT do ator e RLS** depois de o RPC recusar a tentativa. Não é uma leitura privilegiada para descobrir convite de outra empresa, e nunca autoriza envio. O RPC transacional permanece a autoridade.

Um erro 500 de Auth não prova que a falha é SMTP: pode haver hook ou outra dependência. O código informa a etapa; os logs de Auth do projeto devem identificar a causa externa.

## 4. SMTP real — o que conferir e configurar

Na documentação consultada em 19/09/2026, o SMTP padrão restringe destinatários aos membros da equipe do projeto e não é destinado à operação comercial. Isso pode explicar falha em e-mails diferentes, mas precisa ser confirmado no erro/log da tentativa. Não adicionar clientes à equipe administrativa do Supabase para contornar a restrição. [Documentação oficial de SMTP](https://supabase.com/docs/guides/auth/auth-smtp).

O limite publicado para o serviço padrão é de dois e-mails por hora por projeto. Há também limites de endpoint e intervalo de recuperação por usuário. Trocar de e-mail não elimina o limite do projeto. Custom SMTP continua sujeito a limites do Auth e do fornecedor; não desative proteção para fazer testes passar. [Limites oficiais do Auth](https://supabase.com/docs/guides/auth/rate-limits).

Configuração a ser feita **pelo proprietário**, sem contratação automática:

1. Escolher serviço SMTP e obter host, porta, usuário, senha e remetente autorizado.
2. Verificar o remetente/domínio no fornecedor e aplicar seus registros SPF/DKIM/DMARC. Manter autenticação de e-mail separada de marketing.
3. No Supabase dedicado, em **Authentication → Email/SMTP Settings**, habilitar Custom SMTP e preencher os dados acima, nome do remetente VIRELOQ e endereço de envio. O nome do menu pode variar; procurar a configuração de SMTP da seção Auth.
4. Conferir restrições de sandbox/destinatários e limites do fornecedor. Em **Authentication → Rate Limits**, ajustar limites adequados ao teste e à operação prevista, mantendo proteção contra abuso.
5. Guardar credenciais SMTP no painel do provedor/Auth. Elas não devem ser colocadas no frontend nem em variáveis `VITE_`. [Configuração oficial](https://supabase.com/docs/guides/auth/auth-smtp).

Templates e redirects:

- Conferir **Invite user** e **Reset password** em Authentication → Email Templates. Os HTMLs já existentes em `supabase/templates/invite.html` e `recovery.html` continuam válidos e mantêm a marca. Copiar cada arquivo para o template correspondente se ainda não foi aplicado.
- Os templates entregues usam `.RedirectTo`, `TokenHash` e tipo `invite`/`recovery` no fragmento. Não substituir `.RedirectTo` por Site URL: isso pode perder `?convite=...`.
- O template padrão com `ConfirmationURL` também é aceito pela correção. Ele pode consumir o link antes do redirect, inclusive por um scanner. O template direto com confirmação na aplicação reduz esse problema.
- Conferir Site URL e allowlist para a origem local utilizada e as rotas `/aceitar-convite` (preservando o parâmetro `convite`) e `/atualizar-senha`. O domínio/porta do frontend, `PLATFORM_APP_ORIGIN`, redirects e `VITE_PLATFORM_API_URL` devem corresponder aos processos locais corretos.
- Para homologação com redirect `127.0.0.1`, abrir o e-mail **no mesmo computador** que executa Vite. No celular, esse endereço não alcança o computador. Teste em dispositivo externo exige URL acessível ao dispositivo e configuração pelo proprietário; não foi feito deploy para isso.
- Conferir alterações de link por rastreamento do provedor e ferramentas de segurança; não desabilitar controles de Auth. Usar sempre a mensagem mais recente.

Referências: [templates oficiais](https://supabase.com/docs/guides/auth/auth-email-templates), [recuperação de senha](https://supabase.com/docs/reference/javascript/auth-resetpasswordforemail), [códigos oficiais de erro](https://supabase.com/docs/guides/auth/debugging/error-codes).

## 5. Atualização da instalação atual — sem reset

O arquivo `VIRELOQ-Correcao-Convites.zip` é **uma correção incremental**, não um projeto independente. Ele parte da última entrega VIRELOQ, incluindo a correção visual dos checkboxes. O pacote contém somente arquivos alterados/adicionados, testes, evidências, documentação e manifests.

1. Pare Vite e Platform API com `Ctrl+C` nos respectivos terminais.
2. Faça uma cópia local de segurança da pasta atual do projeto. Preserve `.env`, `.env.local` e `.env.server`. Se alterou manualmente arquivos de código, compare-os com `PATCH-MANIFEST.json` antes de sobrescrever para não perder ajustes próprios.
3. Extraia o ZIP da correção em uma **pasta separada**. Copie o conteúdo da pasta `foundation` da correção por cima da sua pasta `foundation` existente, mesclando as pastas. Não apague a instalação para aplicar este ZIP.
4. **Não execute SQL, migrations, `db reset`, limpeza de usuários, exclusão de empresa ou reset de trial.** Nenhum arquivo de migration acompanha esta correção.
5. Dependências e lockfile não mudaram. Em instalação já preparada, não é necessária reinstalação. Se estiver sem dependências, execute `npm ci` na pasta do projeto.
6. Execute `npm run build`. Reinicie Platform API com `npm run platform:dev` e o frontend com `npm run dev`. No seu ambiente real, **não use `dev:demo`**.
7. Recarregue a página no navegador. Confira os templates/redirects/SMTP descritos acima. O envio já recebido não ganha validade retroativamente; solicite novas instruções.
8. Como gestor autorizado, abra Pessoas e acessos da organização e use **Reenviar instruções** no convite pendente. Aguarde o cooldown se necessário.
9. Abra a nova mensagem no computador correto; confirme o link, defina a senha e verifique o vínculo. Faça também logout/login. O destinatário não recebe papel global nem novo trial.

Exemplo de cópia no PowerShell, substituindo os dois caminhos pelos seus caminhos reais:

```powershell
$projectPath = 'C:\caminho\da\instalacao\foundation'
$patchPath = 'C:\caminho\VIRELOQ-Correcao-Convites'
Copy-Item -Path "$patchPath\foundation\*" -Destination $projectPath -Recurse -Force
Set-Location $projectPath
npm run build
```

Depois, em dois terminais nessa pasta:

```powershell
npm run platform:dev
```

```powershell
npm run dev
```

Os manifests registram o conteúdo da correção e o estado resultante sobre a última entrega. A conferência de hashes não substitui o backup de alterações locais.

Se houver falha, veja **Network → POST /invitations/send → resposta**: use `error` e `request_id` para localizar o evento no terminal da Platform API. Para SMTP/erro de Auth, consulte os logs de Authentication do Supabase e os eventos do fornecedor. Não compartilhe Authorization, cookies, `.env`, token ou URL completa do e-mail. Após corrigir a configuração, tente novamente respeitando os limites; o convite pendente é preservado.

## 6. Testes executados e cobertura A–N

Todos os testes desta correção foram **LOCAIS**, com dados fictícios. Nenhum SMTP real foi homologado aqui.

| Grupo | Resultado |
|---|---:|
| Orquestrador de envio e HTTP sanitizado, adapters controlados | 32/32 PASS |
| Convites, comandos e isolamento em SQL/PGlite | 12/12 PASS |
| Regressão de segurança da Fundação em SQL/PGlite | 68/68 PASS |
| Interface Fundação/convites/recuperação com SDK e respostas locais controladas | 30/30 PASS |
| Demo integrada: administrador + funcionário, desktop e celular | 2/2 PASS |
| Configuração segura | 3/3 PASS |
| Smoke HTTP da demo (SQL, anexos e isolamento locais) | 1/1 PASS |
| **Casos selecionados, sem somar reexecuções** | **148 PASS** |

Typecheck, build e varredura de segredo server-only no bundle: PASS. Todas as 25 migrations comparadas byte a byte à entrega anterior: preservadas. A regressão integral de todas as áreas do produto não foi repetida para esta correção pontual.

| Cenário solicitado | Evidência local |
|---|---|
| A — novo convite → e-mail → senha → vínculo | Adapter de envio + demo com caixa de e-mail fictícia; SQL de aceite. Entrega SMTP externa ainda precisa ser repetida. |
| B — link expirado | Query e fragmento com `otp_expired`, inclusive com sessão anterior; sem campos de senha. |
| C — consumido/inválido | OTP recusado, UUID sem prova e PKCE sem verificador; sessão antiga não é aproveitada. |
| D — Auth existente + pendente | `email_exists`/`user_already_exists` → recovery para mesmo endereço/ID; callback de recuperação e aceite. |
| E — reenvio bem-sucedido | Sucesso do adapter, lease finalizado, estado persistido e mensagem atual. |
| F — rate limit | Classificação de limite externo, cooldown interno e cinco tentativas; nenhum sucesso antigo. |
| G — falha de e-mail | Invite/recovery falham de maneira distinta; `failed` persistido e refletido na tela. |
| H — sucesso antigo | Sucesso seguido de quatro classes de falha; mensagem antiga removida e estado atualizado. |
| I/J — revogado/expirado | Reenvio negado no claim e aceite negado no banco; botão não oferecido. |
| K — vínculo único | Reenvio mantém convite; aceite repetido não duplica membership. |
| L — papel | Colaborador continua colaborador; nenhum papel global/trial criado. |
| M — organizações | RLS, UUID alheio e claim de outra organização negados. |
| N — service role | Configuração/bundle, resposta HTTP e logs sem segredo/link/payload do provedor. |

Falhas encontradas durante os testes e correções: um novo teste SQL referenciava o nome errado da tabela privada de trials; ajustado para o modelo existente. A fixture do callback implícito usava cabeçalho JWT inválido; corrigida para estrutura JWT fictícia válida, sem reduzir validação do SDK. A demo expôs a limitação de projeção de colunas descrita acima; corrigida e verificada novamente. As últimas execuções listadas passaram; logs das tentativas relevantes foram preservados.

Comandos reproduzíveis na raiz `foundation`:

```text
node --test tests/invitation-delivery.test.mjs tests/invitation-http.test.mjs
node tests/invitations.test.mjs
npm test
npm run test:config
npm run check:bundle
npx playwright test tests/browser/foundation.spec.ts tests/browser/invitation-recovery.spec.ts
npx playwright test --config=playwright.demo.config.ts tests/demo-browser/vireloq.spec.ts --grep "convite e primeiro"
npm run test:demo
```

Playwright exige Chromium instalado ou `FOUNDATION_CHROMIUM_PATH` configurado. O comando existente `npm run test:vireloq` também passou a incluir os novos testes HTTP.

## 7. Homologação externa a repetir pelo proprietário

- Convite novo para destinatário autorizado pelo SMTP; e-mail realmente recebido, senha e vínculo.
- Link expirado/consumido, inclusive tendo outra sessão aberta; sem senha antes de novo link válido.
- Reenvio para a conta Auth já criada; recuperação e aceite do mesmo convite.
- Rate limit e destinatário bloqueado retornando os códigos reais do projeto; sucesso antigo ausente.
- Falha de SMTP e retomada após correção, respeitando cooldown/limite.
- Revogação, expiração, suspensão e troca de organização com tokens reais.
- Recebimento e links com Custom SMTP, quando configurado pelo proprietário.

Resultado desta entrega: **correção implementada e testada localmente; homologação SMTP/Auth real pendente de repetição no seu ambiente.** Nenhuma configuração externa, alteração de dados reais, cobrança, deploy ou produção de vídeo foi executada.
