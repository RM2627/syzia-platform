# Homologação da Fundação — execução pelo usuário

Este roteiro prepara exclusivamente a homologação da Fase 2. Não publica a aplicação nem contrata serviços. A Fase 3 foi posteriormente autorizada para desenvolvimento, com validação externa ainda pendente; consulte `phase-3-homologation.md`. As tarefas externas abaixo serão executadas por Marcelo em seu ambiente. Se uma ação depender de pagamento ou de conta/projeto ainda não disponível, mantenha-a pendente.

**Situação atual:** ferramentas preparadas e verificadas localmente; nenhum projeto Supabase foi conectado, nenhuma migration remota foi aplicada e nenhum e-mail real foi enviado pelo agente.

## 1. Preparar o computador e o projeto dedicado

1. Baixe e extraia o ZIP. Abra a pasta `foundation` no terminal.
2. Execute `npm ci` com Node compatível com o projeto. Use `npm run build` para conferir compilação local.
3. No Supabase, selecione ou crie você mesmo um projeto exclusivo para homologação. Não use o banco da MS nem um ambiente com dados reais. Não habilite serviços pagos para cumprir este roteiro.
4. Anote a referência do projeto, URL e chave pública publishable/anon. Não coloque senha do banco, access token administrativo, secret key ou service_role no frontend.
5. Copie `.env.example` para `.env` e preencha somente as duas variáveis públicas da aplicação.
6. Execute `npm run dev -- --port 5173 --strictPort`. Acesse `http://127.0.0.1:5173` no mesmo computador. Não abra túnel público, domínio ou deploy.

## 2. Configurar Auth e o retorno local

Valores propostos para este teste local:

| Configuração | Valor/ação do operador |
|---|---|
| Site URL | `http://127.0.0.1:5173` |
| Redirect URLs | `http://127.0.0.1:5173/entrar` e `http://127.0.0.1:5173/atualizar-senha` |
| Provider de e-mail/senha | Habilitado |
| Confirmação de e-mail | Habilitada; não usar autoconfirmação para provar este fluxo |
| Política de senha | Mínimo 12 caracteres; manter as demais proteções disponíveis |
| Usuários anônimos | Não necessários para a Fundação; manter desabilitados nesta etapa |
| Schemas expostos na Data API | `public` para o código da Fundação; não adicionar `private` ou `auth` |
| Limites de Auth | Registrar os limites efetivos e mantê-los; não elevá-los indiscriminadamente |
| SMTP | Usar configuração de teste sob seu controle, quando disponível; não contratar serviço automaticamente |

Use sempre o mesmo hostname e porta: `localhost` e `127.0.0.1` são origens diferentes. Abra o link recebido no mesmo navegador e computador que iniciou o fluxo PKCE. O navegador do celular não acessa o servidor local do computador usando `127.0.0.1`. O Supabase admite URLs de retorno locais configuradas; veja [Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls).

O SMTP padrão pode restringir destinatários aos membros autorizados da organização e tem limites baixos. Não altere a confirmação de e-mail nem conceda acesso administrativo a pessoas apenas para contornar uma restrição de envio. Se não houver um serviço de teste apropriado já disponível, registre entrega de e-mail como bloqueada. Veja [SMTP do Supabase](https://supabase.com/docs/guides/auth/auth-smtp).

## 3. Aplicar as migrations

Execute cada arquivo completo no SQL Editor do projeto dedicado, na ordem abaixo, uma única vez. Registre arquivo, hash do `MANIFEST.json`, data, resultado e projeto. Não execute a próxima migration se a anterior falhar.

1. `supabase/migrations/202609150001_foundation.sql`
2. `supabase/migrations/202609150002_authorization.sql`
3. `supabase/migrations/202609150003_commands.sql`

Não execute `tests/auth-fixture.sql` no Supabase real. Esse arquivo simula Auth somente nos testes locais.

Em seguida execute `scripts/homologation/inspect-foundation.sql`: ele apenas consulta o banco. Espere seis tabelas com RLS/FORCE RLS, seis policies SELECT, oito RPCs da Fundação e o índice de principal único. Confira que `anon` não executa RPCs da Fundação e que não há grants de escrita direta para `authenticated` nessas tabelas.

Se aplicar pelo SQL Editor, guardar a evidência manual não equivale a registrar automaticamente o histórico na tabela de migrations da CLI. Não use depois `db push` sobre o mesmo ambiente sem reconciliar esse histórico; isso poderia tentar reaplicar arquivos já executados.

## 4. Cadastro e confirmação reais

Prepare seis endereços distintos de teste sob seu controle, com senhas exclusivas. Podem usar nomes fictícios. Não use contatos de clientes.

| Identidade | Papel esperado após a preparação |
|---|---|
| `root` | Superadmin original; nunca alvo dos testes de revogação |
| `adminA` | Administrador da empresa fictícia A |
| `adminB` | Administrador da empresa fictícia B |
| `worker` | Colaborador somente de A |
| `attendant` | Papel de atendente e vínculo principal de A |
| `unlinked` | Papel de atendente sem vínculo inicial |

Para cada conta, cadastre-se pela aplicação, confirme o e-mail recebido e faça login. Não substitua confirmação real por `email_confirm=true` numa API administrativa. Registre separadamente: solicitação de cadastro, recebimento da mensagem, abertura do link, criação de sessão e estado de confirmação no painel Auth. Respeite limites de envio; não automatize repetição em massa.

**Até atribuir papéis, essas contas não devem ter acesso empresarial.** Copie cada UUID em Meu perfil ou no painel Auth. Se e-mail não funcionar, pare essa parte: contas criadas administrativamente não provam cadastro/confirmação reais.

## 5. Bootstrap e dados fictícios

Execute `scripts/bootstrap-super-admin.sql` como proprietário confiável do banco, substituindo `:'admin_user_id'` pelo UUID da conta `root` entre aspas SQL se usar o SQL Editor. O bootstrap recusa um usuário sem confirmação e uma segunda inicialização.

Abra `scripts/homologation/setup-test-fixtures.sql` e substitua os seis placeholders pelos UUIDs confirmados. Execute o arquivo completo. Ele exige exatamente seis usuários/perfis e nenhuma empresa, cria somente A/B fictícias e seus vínculos e falha diante de um conjunto inesperado. Não apaga registros e não reduz RLS.

Não edite a trava para adaptar o script a um banco já utilizado por clientes. Se houver contas excedentes ou estado diferente, revise o ambiente dedicado antes de continuar. A fixture usa IDs fixos para falhar em caso de duplicação; não execute novamente para tentar zerar dados.

## 6. Testes HTTP com Auth real

Crie `.homologation/` e copie `homologation.example.json` para `.homologation/connection.json`. Preencha no seu computador: referência, URL, chave pública e as seis contas. Só marque `testOnlyAcknowledged` como `true` após conferir que é o ambiente fictício dedicado. Essa pasta é ignorada e não deve ser enviada ao agente, ao Git nem ao ZIP.

```bash
npm run homologation:read
```

Esse modo faz login/logout reais, verifica o conjunto de testes e consulta dados por HTTP/PostgREST. Confere isolamento entre empresas, atendentes, membros e auditoria; verifica também requisições sem token e com assinatura adulterada. Ele não verifica entrega de e-mail nem executa tentativas de escrita.

Depois, no mesmo ambiente:

```bash
npm run homologation:mutations
```

Esse modo também tenta operações proibidas, suspende/revoga temporariamente contas/vínculos de teste e restaura os estados previstos em blocos `finally`. Os testes reutilizam explicitamente os access tokens emitidos antes da suspensão. A conta `root` nunca é suspensa/revogada. Revogações entre `adminA`/`adminB` usam papéis globais temporários; `root` permanece disponível para recuperação.

São criados eventos reais de auditoria e registros suspensos de vínculos de teste. Não são apagados ao terminar. Os testes posteriores aceitam esses registros suspensos. Se houver interrupção de rede/processo, `finally` não é garantia absoluta de restauração: confira o estado pelo superadmin original e reative apenas os vínculos esperados nesta tabela. Não rode novamente sem essa verificação.

Os relatórios saem em `.homologation/reports/`, sem senhas, tokens ou e-mails. `PASS` só aparece após executar e satisfazer a condição do teste. O campo global `homologated` permanece `false`: a decisão final exige juntar também evidências de e-mail, configurações, concorrência controlada e restauração.

## 7. Recuperação de senha e logout pela interface

Use `worker` para o teste, em janela própria:

1. Saia e confirme que uma rota protegida pede login.
2. Solicite recuperação; registre recebimento do e-mail, abertura do link e formulário de senha.
3. Defina uma senha nova válida e faça login com ela.
4. Confira que a senha antiga falha. Atualize apenas sua configuração local de testes com a senha nova.
5. Abra novamente o link já usado ou expirado: não deve permitir nova troca de senha sem autorização válida.
6. Registre o resultado de sessão/refresh no Auth sem copiar credenciais para o relatório.

Logout e suspensão não são a mesma garantia. A aplicação usa logout local da sessão. Não interprete a eventual validade de um access token já emitido até seu vencimento como prova de que o logout falhou; teste revogação de refresh e limpeza local separadamente. A suspensão/vínculo é conferida pelo banco a cada nova operação e tem seus testes próprios.

## 8. Concorrência com conexões SQL independentes

Os pedidos HTTP paralelos do runner verificam o resultado comercial, mas não provam que o pool usou PIDs diferentes nem que houve sobreposição controlada. Para concluir a pendência original, use duas conexões persistentes de `psql` ao banco de teste, com o modo de conexão por sessão apropriado e TLS validado. Não use dois comandos soltos no SQL Editor como prova de sessão persistente.

Use os dados de conexão exibidos pelo Supabase. Guarde a senha localmente de forma apropriada ou use o prompt de senha; não a coloque no relatório. Não desabilite validação TLS para conectar. A conexão administrativa aqui é usada para montar contexto SQL de teste; esta evidência avalia concorrência do banco, enquanto a validação de tokens reais é coberta pelo runner HTTP.

### Revogação cruzada

Pela interface do superadmin `root`, conceda temporariamente `super_admin` a `adminA` e `adminB`. Não altere o papel de `root`.

Na conexão A, defina variáveis psql e execute:

```sql
\set actor_uuid 'UUID_ADMIN_A'
\set target_uuid 'UUID_ADMIN_B'
\i scripts/homologation/concurrency-session-a.sql
```

Assim que A tiver executado a revogação e estiver na pausa de 15 segundos, execute na conexão B:

```sql
\set actor_uuid 'UUID_ADMIN_B'
\set target_uuid 'UUID_ADMIN_A'
\i scripts/homologation/concurrency-session-b.sql
```

Registre PIDs distintos e tempos. Esperado: A confirma; B aguarda o lock e depois recebe `42501`. Se os dois confirmarem, a Fundação falha na homologação. Ao terminar, `root` revoga os dois papéis temporários, mantendo os papéis empresariais.

### Dois atendentes principais

Confirme que B não tem principal ativo. Na conexão A, use `root_uuid=UUID_ROOT` e `attendant_uuid=UUID_ATTENDANT`, depois execute `concurrency-primary-a.sql`. Durante a pausa, na conexão B use o mesmo `root_uuid` e `attendant_uuid=UUID_UNLINKED`, depois execute `concurrency-primary-b.sql`.

Esperado: PIDs diferentes, A confirma e B recebe `23505` após aguardar; B fica com um único principal ativo. Ao terminar, suspenda pela interface os vínculos de teste criados em B. O vínculo original de `attendant` em A permanece ativo.

## 9. Proteção contra abuso e segredos

Execute localmente `node tests/config-security.mjs`. Antes de qualquer build que será distribuído, confira as variáveis públicas e procure chaves privilegiadas no bundle. O exemplo de homologação usa apenas credenciais de usuários de teste, fora do frontend e do pacote.

No Supabase, registre limites de envio, login, refresh e recuperação; não faça um teste de inundação para descobri-los. Interrompa em `429` e respeite o período indicado. Aplique os limites e restrições disponíveis sem contratar recursos. Veja [Rate limits](https://supabase.com/docs/guides/auth/rate-limits).

**CAPTCHA é uma pendência explícita:** o frontend atual não integra widget/token CAPTCHA. Habilitar uma exigência no Supabase sem integrar o token pode bloquear cadastro/login/recuperação. Não desligue uma exigência já vigente para passar testes: registre o bloqueio e solicite uma correção da Fundação dentro da fase aprovada. Não declare prontidão para exposição pública apenas com limites de requisição.

## 10. Backup e restauração compatíveis com esta etapa

A estratégia inicial tem duas partes: (a) fonte, lockfile, migrations e manifesto versionados pelo usuário; (b) backup dos dados fictícios e configuração do ambiente, mantidos separadamente dos arquivos distribuídos. Faça um backup antes de alterar o banco e depois de fechar uma homologação bem-sucedida. Registre data, projeto, ferramenta, escopo, hash e local seguro.

Verifique no próprio plano quais backups/restores já estão disponíveis. Não ative PITR, upgrade ou outro serviço pago para executar este roteiro. Um dump somente de `public` não inclui necessariamente identidades Auth, configuração de autenticação ou todos os demais componentes. Use a [documentação de backups do Supabase](https://supabase.com/docs/guides/platform/backups) para selecionar um método que preserve as dependências do ambiente.

Para o ensaio de restauração, escolha um destino vazio e isolado, compatível com Supabase/PostgreSQL e já disponível sem contratação. Nunca restaure por cima do projeto usado para a homologação. Se esse destino não estiver disponível, marque o teste como NÃO EXECUTADO.

1. Identifique separadamente origem e destino e confirme ausência de clientes reais em ambos.
2. Gere o backup com a ferramenta suportada, registrando quais dados/configurações estão incluídos e excluídos. Não compartilhe o backup: mesmo usuários fictícios podem ter hashes e segredos de autenticação.
3. Restaure no destino seguindo o procedimento do método escolhido. Não desabilite RLS, constraints ou triggers para forçar uma importação que falhou.
4. Execute `inspect-foundation.sql` no destino e compare tabelas, constraints, índices, policies e funções com a origem.
5. Compare contagens das seis tabelas e integridade dos vínculos, preservando também auditoria e posições de sequências.
6. Reconfigure somente os dados de conexão do cliente de testes para o destino; confirme usuários Auth e repita testes HTTP quando o método tiver restaurado Auth adequadamente.
7. Registre tempo de restauração, divergências, limites e correções. Um teste que recupera apenas esquema, sem dados e Auth, não prova recuperação integral.

Não foi criado um script automático de restore destrutivo: o método depende do backup real e do destino disponível. As verificações posteriores estão preparadas sem exigir alteração de segurança.

## 11. Fechamento e evidências

Preencha `docs/homologation-report-template.md`. Mantenha cada item como PASS, FAIL, BLOCKED ou NOT_EXECUTED com sua evidência. O relatório deve registrar as migrations realmente aplicadas, configurações feitas, falhas e correções, e as pendências restantes.

Somente classifique a Fundação como homologada para revisão de avanço quando os critérios da Fase 2 tiverem evidências suficientes. Isso não autoriza produção. A aprovação posterior de desenvolvimento da Fase 3 não representa homologação real; a Fase 4 permanece sujeita à aprovação expressa de Marcelo.

## Complemento da Fase 3

Após as migrations 004 e 005, o total passa a 16 tabelas e 16 policies. Preserve o inventário original das seis tabelas da Fundação e acrescente `scripts/homologation/company-inspect.sql`. Para backup/restore do pacote atual, inclua todas as 16 tabelas e siga `docs/phase-3-homologation.md`. A única execução anônima adicional é a projeção `company_public_faq(text)`; tabelas privadas continuam sem acesso anônimo.
