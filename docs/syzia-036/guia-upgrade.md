# SYZIA 036 — atualização e homologação pelo proprietário

Base: 035 mais recente, banco já com migrations 001–033. A 036 contém uma migration incremental. **Não resetar o banco nem recriar pessoas.** Este guia prepara os passos; nenhum ambiente externo foi alterado nesta entrega.

## Atualização coordenada

1. Preserve a pasta 035 e suas configurações. Extraia o ZIP em pasta separada e abra `foundation`.
2. Copie seus arquivos locais de ambiente, como `.env.local` e `.env.server`, mantendo credenciais exclusivamente no servidor. Execute `npm ci` e `npm run build`. No PowerShell, use `npm.cmd` se necessário.
3. Encerre os processos antigos durante a troca. No ambiente de homologação sob seu controle, aplique **somente** `supabase/migrations/202609250036_activation_links.sql` pelo procedimento SQL que já utiliza. Ela é transacional; não reaplique migrations antigas. Não há migrations 034 ou 035.
4. Reinicie frontend e Platform API a partir da pasta 036. Não misture frontend 035/API 036 nem API 035/frontend 036 durante a homologação. Atualizar só o navegador não atualiza o servidor.
5. Se a ferramenta de migrations não atualizar automaticamente o catálogo do PostgREST, recarregue seu schema cache pelo procedimento usual do projeto antes de testar as RPCs novas.

Três terminais, todos na nova pasta:

```text
npm run dev
npm run platform:dev
npm run attachments:dev
```

O gateway de mídia não foi alterado, mas continua necessário aos módulos que já o utilizam. SMTP não é requisito para provisionar nem entregar instruções manualmente. Não use os exemplos de ambiente como substitutos de suas configurações.

## Primeiro acesso e preparações existentes

- Reserva incompleta: autentique o operador e use **Retomar provisionamento** na mesma pessoa. Não faça novo cadastro.
- Preparação concluída: copie instruções, código ou link. Abra o link em outra sessão; deve aparecer somente **Código temporário**. Valide, defina a senha e entre por e-mail ou usuário.
- Link 034/035 completo: continua aceito enquanto a preparação/código originais forem válidos. Os dados antigos do fragmento são lidos internamente, sem campos visíveis.
- Código perdido, expirado ou sem link: use **Gerar novo código de primeiro acesso** ou **Redefinir acesso**, conforme a tela existente. Compartilhe o novo link junto com o novo código. O par anterior deixa de funcionar.
- Usuário já ativo: continue usando sua senha. Não reemitir credenciais sem necessidade.

## Conferência focada

1. Criar/provisionar pessoa; conferir as três cópias e ausência de Código empresarial nas instruções.
2. Outra sessão: abrir link, recarregar, informar apenas código e criar senha. Código usado deve ser recusado.
3. Tentar código incorreto, expirado e anterior após reemissão. Trocar o link na mesma aba também deve atualizar o contexto.
4. Forçar uma falha controlada apenas em ambiente fictício, quando aplicável; retomar a mesma reserva sem duplicação.
5. Login de uma empresa, várias empresas, Equipe SYZIA e Super Admin. Conferir destinos e seleção posterior à autenticação.
6. Username igual em empresas A/B para pessoas distintas: usar e-mail para desambiguar; nenhuma empresa deve ser revelada na falha. Para a mesma pessoa com dois vínculos, conferir seleção de contexto.
7. Conta A não pode selecionar nem acessar a organização B à qual não pertence.

Testes locais reproduzíveis:

```text
npm run diagnose:036
npm run test:036
npm run test:036:browser
npm run build
```

O diagnóstico usa exclusivamente uma fixture PGlite descartável da base 035. Os testes de navegador usam `dev:demo` automaticamente: não deixe outro processo ocupando 5173/54321. Configure o Chromium do Playwright conforme seu ambiente; `FOUNDATION_CHROMIUM_PATH` é opcional para executável já instalado.

## Diagnóstico de nova falha

Guarde `request_id`, `code`, `stage`, `category`, `status` e `reason` do evento sanitizado na Platform API. Não compartilhe código completo, link completo, senha, token ou resposta bruta do provider.

| Motivo interno | Ação |
|---|---|
| `activation_code_invalid` | Conferir código e link da mesma emissão. |
| `activation_code_expired` / `activation_attempts_exhausted` | Reemitir pela ação administrativa existente. |
| `activation_already_used` | Entrar com a senha definida; recuperação administrativa se necessário. |
| `activation_link_invalid` / `activation_link_replaced` / `activation_link_required` | Abrir o último link emitido; não misturar versões das instruções. |
| `activation_context_invalid` | Link legado incompleto/incompatível; obter novas instruções. |
| `activation_preparation_incompatible` | Administração verifica estado/identidade/vínculo pelos controles existentes; não editar tabelas para contornar a regra. |
| `activation_proof_invalid` | Validar novamente o código ainda válido; a prova expira ou é substituída por nova validação. |
| `activation_uncertain` | Conferir a operação Auth e seu diagnóstico antes de reemitir; não presumir ativação concluída. |
| `access_unavailable` logo após upgrade | Conferir API da pasta 036, migration aplicada e schema cache do PostgREST. |

Os dois eventos históricos informados não têm detalhes suficientes para atribuir uma causa exata. Os novos diagnósticos permitem correlacionar a condição com o request_id sem expor credenciais.

Após homologar ou registrar os achados, manter a rodada encerrada. Nenhum deploy, produção, reset ou nova fase é autorizado por este guia.
