# SYZIA --- RODADA 037 PÓS-HOMOLOGAÇÃO 036

## Correção focada --- reemissão do primeiro acesso

> **Base exclusiva:** consolidado SYZIA 036 mais recente.
>
> Corrigir somente a regressão encontrada na homologação. Não
> reconstruir autenticação ou primeiro acesso.

# 0. Problema reproduzido

Em **Administração SYZIA → Pessoas e acessos → Abrir ficha →
Segurança**, ao clicar em **Gerar novo código de primeiro acesso**, a
operação termina apenas com:

> Alteração salva.

A pessoa continua em **Aguardando primeiro acesso**, porém as novas
credenciais não são reapresentadas ao operador.

Isso está incorreto. A reemissão precisa devolver imediatamente o novo
código e o novo link para que o administrador possa compartilhá-los.

# 1. Comportamento correto

Ao clicar em **Gerar novo código de primeiro acesso**:

1.  invalidar o par anterior conforme as regras existentes;
2.  gerar novo código temporário + novo link;
3.  preservar pessoa, Auth, vínculos, papel, empresa, username e trial;
4.  reapresentar imediatamente o painel de credenciais;
5.  levar foco/scroll para esse painel;
6.  permitir copiar e compartilhar as novas instruções.

Não terminar apenas em uma confirmação genérica.

# 2. Painel após reemissão

Exibir algo equivalente a:

## Novo acesso gerado

**Nome:** Ranna Aghatta\
**Usuário:** `ranna.aghatta`\
**Código temporário:** `[novo código]`\
**Link de primeiro acesso:** `[novo link]`

Ações:

-   **Copiar instruções de acesso**
-   **Copiar código**
-   **Copiar link**

Aviso:

> O código e o link anteriores não são mais válidos. Compartilhe estas
> novas instruções com a pessoa.

Usar os dados reais da emissão.

# 3. Segurança

Preservar: - código expirável e de uso único; - link/seletor seguro da
036; - invalidação do par anterior; - exposição do segredo somente no
momento da emissão/reemissão; - ausência de código temporário
recuperável permanentemente em texto puro.

Se o operador perder as novas credenciais depois de sair da
apresentação, deve gerar outro código. Não criar consulta permanente do
segredo.

# 4. Estado da pessoa

Reemitir credenciais para quem ainda não ativou deve manter:

**Aguardando primeiro acesso**

Não: - ativar; - suspender; - duplicar pessoa; - duplicar Auth; -
duplicar vínculo; - alterar empresa; - alterar papel; - alterar
username; - reiniciar trial.

# 5. Preservar o fluxo 036

Manter:

**link identifica a preparação; código temporário comprova a ativação.**

Não reintroduzir **Código da empresa/SYZIA**.

As instruções podem ser:

> Olá! Seu acesso à SYZIA foi atualizado.
>
> Usuário: ranna.aghatta\
> Código temporário: XXXXXXXX\
> Primeiro acesso: \[link\]
>
> Abra o link, informe o código temporário e crie sua senha.

# 6. UX

Após reemissão: - feedback específico, não apenas "Alteração salva"; -
painel de credenciais visível; - scroll/foco automático quando
necessário; - feedback nas ações de copiar; - funcionamento em desktop e
celular.

Se a 036 já possui componente de apresentação usado na emissão inicial,
**reutilizá-lo**. Não criar segunda implementação desnecessária.

# 7. Falha na reemissão

Se a operação falhar: - não mostrar credenciais novas; - não afirmar
sucesso; - preservar consistência/atomicidade do estado; - mostrar erro
coerente; - logs somente sanitizados.

Nunca registrar código completo, link completo, senha, token ou segredo.

# 8. Testes focados

## Emissão inicial

Criar/provisionar pessoa → credenciais aparecem → copiar
instruções/código/link funciona.

## Reemissão

Pessoa Aguardando primeiro acesso → Gerar novo código → painel aparece →
foco/scroll → três ações de cópia funcionam → estado continua
aguardando.

## Par anterior

Após reemissão, par anterior é recusado e novo par funciona.

## Saída/reload

Depois de perder a apresentação, o segredo antigo não é recuperável em
texto puro; nova reemissão continua disponível.

## Isolamento

Reemissão da pessoa A não altera pessoa B.

## Responsividade

Desktop e celular.

# 9. Banco

A expectativa é correção de fluxo/UI usando a emissão já existente.

**Não criar migration sem necessidade real.**

Preservar migrations existentes. Sem reset.

# 10. Fora do escopo

Não alterar: - arquitetura de login da 036; - seletor opaco; - usernames
repetidos; - landing; - demo; - capa/mídia; - financeiro; - billing; -
planos; - aquisição; - onboarding.

Sem deploy e sem nova fase.

# 11. Critérios de aceite

-   [ ] Reemissão não termina apenas em "Alteração salva".
-   [ ] Novo código e novo link aparecem imediatamente.
-   [ ] Copiar instruções/código/link funciona.
-   [ ] Foco/scroll leva ao painel.
-   [ ] Par anterior é invalidado.
-   [ ] Novo par funciona.
-   [ ] Estado permanece Aguardando primeiro acesso até ativação.
-   [ ] Nenhuma pessoa/Auth/vínculo é duplicado.
-   [ ] Segredo não fica recuperável permanentemente.
-   [ ] Código empresarial não retorna à UX.
-   [ ] Desktop/celular passam.
-   [ ] Build/typecheck e testes focados passam.
-   [ ] Sem migration nova sem justificativa.

# 12. Regra final

Correção focada sobre a SYZIA 036. Reutilizar a apresentação de
credenciais já existente.

Ao concluir: **ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**
