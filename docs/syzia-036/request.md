# SYZIA --- RODADA 036 PÓS-HOMOLOGAÇÃO 035

## Correção do primeiro acesso + remoção do Código de acesso da experiência visível

> **Base exclusiva:** consolidado SYZIA 035 mais recente.
>
> Rodada focada nos achados reais da homologação pós-035. Não
> reimplementar funcionalidades concluídas.

## 0. Regras

-   Inspecionar a 035 antes de alterar.
-   Diagnosticar `activation_invalid` antes de corrigir.
-   Preservar identidade global, vínculos, isolamento, Auth, RLS, grants
    e auditoria.
-   Não tornar usernames empresariais globalmente únicos para
    simplificar login.
-   Não criar autenticação paralela.
-   Sem reset, deploy ou produção.
-   Testes focados + build/typecheck; não repetir auditoria mestre.
-   Preservar migrations existentes; nova migration somente se
    indispensável e justificada.
-   Não facilitar enumeração de usuários/empresas.

# 1. BUG REAL --- ACTIVATION_INVALID

Na homologação da 035, o primeiro acesso exibiu:

> Código inválido, expirado ou já utilizado.

A Platform API registrou:

``` text
{"event":"enterprise_access_failed","request_id":"7d1af94c-639e-40a5-9591-0693e3a4c6d9","code":"activation_invalid","status":400}
{"event":"enterprise_access_failed","request_id":"29e82904-c6b9-4c6e-ac0a-9eaa0cbf755f","code":"activation_invalid","status":400}
```

Preservar esses request_ids como evidência.

Investigar a causa real. Mapear código temporário/hash, expiração, uso
anterior, reemissão, preparação/estado, identidade Auth, username,
organização/contexto, Código empresarial atualmente informado, link de
primeiro acesso, revisão da credencial, concorrência e RPC/função de
ativação.

Um código recém-emitido, válido e nunca utilizado deve ativar o acesso
correto.

Não corrigir apenas a mensagem. Preservar uso único, expiração,
invalidação e reemissão segura.

# 2. REMOVER CÓDIGO DE ACESSO DO PRIMEIRO ACESSO

O titular não deve precisar digitar **Código de acesso (empresa ou
SYZIA)**.

Fluxo desejado:

``` text
administrador cria usuário
→ provisionamento conclui
→ código temporário + link
→ titular abre link
→ preparação/contexto é identificado internamente
→ titular informa código temporário
→ validação
→ cria senha definitiva
→ acesso ativado
```

O link deve identificar a preparação/contexto por mecanismo opaco e
seguro, reutilizando a arquitetura existente quando possível.

Não expor como mecanismo de segurança UUIDs/IDs internos, hashes ou
segredos server-side.

Conceito: **link identifica a preparação; código temporário comprova a
ativação.**

Se o link já identifica inequivocamente a preparação, evitar pedir
username/e-mail novamente sem necessidade.

Tela desejada:

### Ativar seu acesso

**Código temporário**\
`[____________]`

**Validar código**

Depois: Nova senha + Confirmar nova senha.

# 3. LOGIN NORMAL SEM CÓDIGO EMPRESARIAL VISÍVEL

Revisar o login cotidiano.

Objetivo:

### Entrar na SYZIA

**E-mail ou usuário**\
**Senha**

Depois da autenticação: - uma empresa → ambiente permitido; - várias
empresas → seleção de contexto; - Equipe SYZIA → contexto global
permitido; - Super Admin → Administração SYZIA.

Remover a dependência visível do Código empresarial sem enfraquecer a
resolução interna de contexto.

# 4. USERNAMES IGUAIS ENTRE EMPRESAS

Preservar:

``` text
Empresa A → joao.silva
Empresa B → joao.silva
```

Não impor unicidade global aos usernames empresariais.

Resolver ambiguidade por identidade global/contexto e, quando
necessário, seleção segura posterior. Preferir e-mail/identidade global
para desambiguação em vez de exigir que o usuário memorize Código da
empresa.

Documentar a solução final.

# 5. COPIAR INSTRUÇÕES

Atualizar a mensagem da 034/035 para não pedir Código da empresa.

Exemplo:

> Olá! Seu acesso à SYZIA foi criado.
>
> Usuário: joao.silva\
> Código temporário: XXXXXXXX\
> Primeiro acesso: \[link\]
>
> Abra o link, informe o código temporário e crie sua senha.

Preservar: - Copiar instruções; - Copiar código; - Copiar link; - envio
manual por qualquer canal; - SMTP opcional.

O username pode aparecer como informação da conta, mesmo que não seja
necessário para ativação.

# 6. SEGURANÇA E ERROS

Preservar código temporário seguro, expirável, uso único, invalidação
após ativação e reemissão que invalida o anterior. Não armazenar/expor
permanentemente em texto puro.

Internamente, quando seguro, distinguir: - expirado; - já utilizado; -
inválido; - preparação incompatível; - preparação concluída; -
link/contexto inválido.

Externamente, usar mensagens úteis sem facilitar enumeração.

`activation_invalid` não deve mascarar causas conhecidas quando a
aplicação puder classificá-las de forma segura.

Logs somente com diagnóstico sanitizado.

# 7. COMPATIBILIDADE

Inspecionar impacto sobre: - usuários já ativados; - preparações
pendentes da 035; - links já emitidos; - reemissão; - múltiplos
vínculos; - Equipe SYZIA; - Super Admin; - usuários empresariais; -
usernames repetidos; - login por e-mail; - login por username.

Preservar preparações existentes quando possível. Se link antigo
precisar ser reemitido, oferecer caminho seguro sem apagar a pessoa.

# 8. TESTES OBRIGATÓRIOS E FOCADOS

## A --- Primeiro acesso

Criar usuário → provisionar → exibir código/link → copiar instruções →
abrir em outra sessão → não solicitar Código empresarial → informar
código temporário → validar → criar senha → código deixa de funcionar.

## B --- Código inválido

Testar incorreto, expirado, já utilizado e anterior após reemissão.

## C --- Retomada

Preparação incompleta → Retomar → concluir → novo link/código → primeiro
acesso, sem duplicação.

## D --- Login/contextos

Testar uma empresa, várias empresas, Equipe SYZIA e Super Admin.

## E --- Username repetido

Empresa A e B com `joao.silva`: sem colisão indevida, elevação ou
vazamento.

## F --- Isolamento

Contexto A não concede acesso à organização B.

# 9. BANCO E MIGRATIONS

Preservar migrations existentes.

Não criar migration se a solução couber nas estruturas atuais.

Se o identificador opaco do link exigir persistência nova: -
justificar; - criar migration incremental; - preservar preparações
existentes; - testar upgrade; - não resetar.

# 10. FORA DO ESCOPO

Não alterar landing, demonstração, capa 4:3, mídia, financeiro, billing,
planos, aquisição, self-service comercial ou design geral.

Não fazer deploy nem iniciar nova fase.

# 11. RELATÓRIO FINAL

Entregar: 1. causa raiz de `activation_invalid`; 2. análise dos
request_ids quando possível; 3. alteração do primeiro acesso; 4.
mecanismo do link/preparação; 5. fluxo final do código temporário; 6.
fluxo final do login; 7. estratégia para usernames iguais; 8.
compatibilidade com preparações existentes; 9. arquivos alterados; 10.
eventual migration; 11. testes; 12. limitações externas.

# 12. CRITÉRIOS DE ACEITE

-   [ ] Causa de `activation_invalid` identificada e corrigida.
-   [ ] Código recém-emitido válido funciona.
-   [ ] Código expirado/usado continua recusado.
-   [ ] Primeiro acesso não exige Código da empresa/SYZIA.
-   [ ] Link identifica preparação/contexto com segurança.
-   [ ] Titular cria a própria senha.
-   [ ] Copiar instruções não inclui Código empresarial.
-   [ ] Login cotidiano não depende visivelmente de Código empresarial.
-   [ ] Uma/múltiplas empresas, Equipe SYZIA e Super Admin funcionam.
-   [ ] Usernames iguais entre empresas continuam suportados.
-   [ ] Sem elevação/vazamento entre organizações.
-   [ ] Reemissão invalida código anterior.
-   [ ] Preparações não são duplicadas.
-   [ ] Build/typecheck e testes focados passam.
-   [ ] Migrations existentes permanecem intactas salvo necessidade
    incremental justificada.

# 13. REGRA FINAL

Primeiro reproduzir e diagnosticar `activation_invalid`. Depois
simplificar primeiro acesso/login preservando identidade e contexto
seguros.

Ao concluir: **ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**
