# SYZIA --- RODADA 035 PÓS-HOMOLOGAÇÃO 034

## Ajustes da demonstração + capa 4:3 + correção do provisionamento Auth

> **Base exclusiva:** consolidado SYZIA 034 mais recente.
>
> Esta rodada reúne somente os achados posteriores à 034 já
> identificados na homologação do proprietário.
>
> **Não reimplementar funcionalidades já concluídas na 034 ou em rodadas
> anteriores.**

------------------------------------------------------------------------

# 0. REGRAS DA RODADA

1.  Inspecionar primeiro a implementação 034.
2.  Alterar somente o necessário para os itens abaixo.
3.  Preservar Auth, isolamento multiempresa, RLS, grants, Storage e
    auditoria.
4.  Não resetar banco.
5.  Não fazer deploy.
6.  Não acessar produção.
7.  Não repetir auditoria mestre.
8.  Executar testes focados + build/typecheck + regressão diretamente
    afetada.
9.  Preservar migrations existentes byte a byte.
10. Se persistência nova for realmente indispensável, criar somente
    migration incremental posterior e justificar.
11. Não inventar causa para erros do provider: diagnosticar pela
    resposta real e pelos logs seguros.

------------------------------------------------------------------------

# 1. PÁGINA DEMONSTRATIVA --- REMOVER LINGUAGEM DE DESENVOLVIMENTO

Na demonstração pública atual aparecem identificações como:

-   `Demonstração local · dados fictícios`
-   `Estúdio Horizonte • Fictício`

Isso deixa a experiência com aparência de ambiente de desenvolvimento e
reduz o realismo da demonstração.

## Comportamento desejado

A empresa demonstrativa deve aparecer normalmente como:

**Estúdio Horizonte**

Remover `• Fictício` do nome apresentado como identidade empresarial.

Também remover linguagem técnica como:

**Demonstração local · dados fictícios**

Substituir por uma identificação única, discreta e comercial, por
exemplo:

**Exemplo de página criada com a SYZIA**

ou redação equivalente coerente com o design atual.

## Regras

-   continuar deixando claro que a página é demonstrativa;
-   não fazer o visitante acreditar que Estúdio Horizonte é
    necessariamente uma empresa real;
-   não repetir avisos de demonstração em vários pontos;
-   não usar "local", "fixture", "mock", "dados fictícios" ou outras
    expressões de desenvolvimento na experiência comercial;
-   preservar a experiência visual da página empresarial real.

------------------------------------------------------------------------

# 2. CAPA EMPRESARIAL --- PROPORÇÃO 4:3

A proporção definida para a área de capa empresarial passa a ser:

**4:3**

Essa regra deve orientar configuração, enquadramento, prévia e
publicação.

## 2.1. Upload/configuração

Na área da capa, informar claramente:

**Proporção recomendada: 4:3**

Quando apropriado, também informar dimensões recomendadas equivalentes
em 4:3.

Não distorcer imagens para fazê-las caber.

Uma imagem fora de 4:3 pode continuar sendo aceita quando tecnicamente
válida, mas deve poder ser ajustada pelo sistema de enquadramento.

## 2.2. Editor de enquadramento

O editor de capa deve utilizar uma janela visual **4:3**.

Permitir:

-   mover/arrastar a imagem;
-   zoom;
-   visualizar a área efetivamente publicada;
-   salvar enquadramento;
-   preservar proporção da imagem;
-   impedir distorção.

## 2.3. Consistência

A mesma regra 4:3 e os mesmos parâmetros de enquadramento devem ser
respeitados em:

-   configuração;
-   prévia;
-   página publicada;
-   desktop;
-   celular, com adaptação responsiva sem mudar arbitrariamente o
    recorte definido.

A prévia deve representar fielmente o resultado publicado.

Não aplicar automaticamente 4:3 à logo, imagens de serviço ou portfólio.
Esta decisão é específica para a **capa empresarial**.

------------------------------------------------------------------------

# 3. BUG CRÍTICO --- RETOMAR PROVISIONAMENTO / AUTH_IDENTITY

Durante a homologação real, em:

**Administração SYZIA → Pessoas e acessos → Preparações pendentes →
Retomar provisionamento**

a interface exibiu:

> Não foi possível concluir. Verifique a conexão e tente novamente.

A Platform API estava ativa.

## 3.1. Evidências reais

Foram registrados:

``` text
Platform API ready on loopback; no public deployment
{"event":"enterprise_access_failed","request_id":"382eb8a4-a163-44c1-ae79-e4c2d67d9008","code":"session_expired","status":400}
{"event":"enterprise_access_failed","request_id":"1d9da31a-79c7-422c-bd03-353ac7f87405","code":"provisioning_incomplete","stage":"auth_identity","category":"auth_identity","status":400,"reason":"auth_provider_unclassified"}
{"event":"enterprise_access_failed","request_id":"eda08628-729d-4234-b622-ab72ba7c7b4a","code":"provisioning_incomplete","stage":"auth_identity","category":"auth_identity","status":400,"reason":"auth_provider_unclassified"}
{"event":"enterprise_access_failed","request_id":"61668819-69f9-4545-ac52-8ae41c6873f9","code":"provisioning_incomplete","stage":"auth_identity","category":"auth_identity","status":400,"reason":"auth_provider_unclassified"}
{"event":"enterprise_access_failed","request_id":"933dd13b-8f05-4e52-bc4d-38d59c9b44af","code":"provisioning_incomplete","stage":"auth_identity","category":"auth_identity","status":400,"reason":"auth_provider_unclassified"}
```

O evento `session_expired` deve ser analisado separadamente.

O erro reproduzível principal é:

``` text
code=provisioning_incomplete
stage=auth_identity
category=auth_identity
status=400
reason=auth_provider_unclassified
```

------------------------------------------------------------------------

# 4. INVESTIGAÇÃO DA CAUSA RAIZ DO AUTH

Não tratar o problema como simples falha de conexão.

A Platform API está respondendo e a etapa `auth_identity` está recebendo
HTTP 400.

Inspecionar o fluxo real de provisionamento administrativo, incluindo:

-   criação/recuperação da identidade no Supabase Auth;
-   `auth.admin.getUserById`, quando aplicável;
-   `auth.admin.createUser`;
-   `auth.admin.updateUserById`, quando aplicável;
-   credencial interna usada durante o provisionamento;
-   limites e requisitos do provider;
-   conflito de e-mail/identidade;
-   identidade Auth já existente;
-   projeto/credenciais server-side;
-   finalização da identidade reservada;
-   retomada idempotente;
-   classificação dos erros do provider.

Se a causa estiver na credencial interna usada para criar a identidade
Auth, corrigir sua geração de forma segura e compatível com os limites
reais do provider.

Essa credencial interna **não é a senha definitiva do usuário**.

Não hardcodar uma correção baseada apenas em hipótese. Confirmar a causa
pelo comportamento/código/retorno real disponível.

------------------------------------------------------------------------

# 5. DIAGNÓSTICO DO PROVIDER

Hoje erros HTTP 400 estão terminando genericamente como:

`auth_provider_unclassified`

Melhorar a classificação quando o Supabase Auth fornecer código seguro e
reconhecível.

O log pode conter:

-   request_id;
-   stage;
-   category;
-   status;
-   motivo/código sanitizado permitido.

Nunca registrar:

-   senha;
-   credencial interna;
-   código temporário completo;
-   access token;
-   refresh token;
-   service_role;
-   documentos pessoais;
-   resposta bruta contendo segredos.

Se o provider retornar um código de validação conhecido, não mascará-lo
como `auth_provider_unclassified` sem necessidade.

------------------------------------------------------------------------

# 6. RETOMAR PROVISIONAMENTO

A correção deve preservar a pessoa/identidade já reservada.

Fluxo esperado:

``` text
pessoa reservada
→ Retomar provisionamento
→ localizar/reutilizar a preparação existente
→ criar ou recuperar a identidade Auth
→ concluir o provisionamento
→ gerar código temporário válido
→ apresentar as credenciais ao operador
```

Não:

-   criar nova pessoa;
-   criar Auth duplicado;
-   duplicar vínculo;
-   criar nova empresa;
-   reiniciar trial;
-   exigir exclusão manual da preparação;
-   alterar username silenciosamente.

Preservar idempotência.

------------------------------------------------------------------------

# 7. INTEGRAÇÃO COM A ENTREGA DE CREDENCIAIS DA 034

Depois que `auth_identity` concluir corretamente, preservar o
comportamento aprovado na 034:

-   mostrar username;
-   mostrar código temporário;
-   mostrar link de primeiro acesso;
-   **Copiar instruções de acesso**;
-   Copiar código;
-   Copiar link.

O administrador escolhe o canal de envio.

E-mail automático não é requisito.

Se o Auth não concluir, não apresentar código como válido.

------------------------------------------------------------------------

# 8. SESSION_EXPIRED

Investigar também o evento:

``` text
code=session_expired
status=400
```

Se representar uma sessão realmente expirada:

-   continuar bloqueando a ação;
-   orientar reautenticação de forma clara;
-   não misturar a mensagem de sessão expirada com falha do provider
    Auth;
-   não relaxar a validação de sessão.

Depois de reautenticar, o operador deve conseguir retomar a mesma
preparação existente.

------------------------------------------------------------------------

# 9. TESTES FOCADOS

Não repetir a auditoria mestre.

## 9.1. Demonstração

Verificar:

-   nome `Estúdio Horizonte` sem `• Fictício`;
-   apenas uma identificação discreta de demonstração;
-   ausência de linguagem de desenvolvimento;
-   desktop e celular.

## 9.2. Capa 4:3

Testar:

-   imagem já em 4:3;
-   imagem horizontal fora de 4:3;
-   imagem vertical;
-   mover;
-   zoom;
-   salvar;
-   recarregar;
-   prévia;
-   publicação;
-   desktop;
-   celular.

Confirmar ausência de distorção e correspondência entre
prévia/publicação.

## 9.3. Provisionamento normal

1.  criar/reservar pessoa;
2.  provisionar Auth;
3.  concluir;
4.  gerar código temporário;
5.  mostrar credencial ao operador;
6.  primeiro acesso;
7.  titular cria senha definitiva;
8.  código é invalidado.

## 9.4. Retomada

1.  manter preparação em estado incompleto/reservado;
2.  Retomar provisionamento;
3.  reutilizar a mesma identidade;
4.  concluir;
5.  não duplicar registros.

## 9.5. Erro conhecido do provider

Simular/validar resposta HTTP 400 conhecida e confirmar:

-   classificação correta;
-   log sanitizado;
-   nenhum segredo;
-   preparação continua retomável.

## 9.6. Sessão expirada

Confirmar:

-   ação bloqueada;
-   mensagem coerente;
-   reautenticação;
-   retomada da mesma preparação;
-   nenhuma duplicação.

## 9.7. Idempotência

Tentativas repetidas/concomitantes sobre a mesma preparação não podem
criar identidades ou vínculos duplicados.

------------------------------------------------------------------------

# 10. BANCO E MIGRATIONS

Preservar migrations existentes.

Não criar migration para:

-   alteração de texto da demo;
-   CSS;
-   correção puramente server-side.

Se o enquadramento 4:3 exigir persistência nova que a 034 ainda não
possua:

-   justificar;
-   criar migration incremental;
-   preservar dados existentes;
-   testar upgrade;
-   não resetar.

------------------------------------------------------------------------

# 11. FORA DO ESCOPO

Não reimplementar nesta rodada:

-   landing institucional;
-   self-service;
-   aquisição/leads;
-   billing/trial;
-   financeiro;
-   login por identidade;
-   mídia geral já concluída na 034;
-   demais funcionalidades anteriores.

Não:

-   fazer deploy;
-   configurar domínio real;
-   alterar provider de pagamento;
-   abrir Storage;
-   enfraquecer RLS;
-   iniciar nova fase automaticamente.

------------------------------------------------------------------------

# 12. RELATÓRIO FINAL

Entregar relatório curto contendo:

1.  ajuste da demonstração;
2.  implementação/validação da capa 4:3;
3.  causa raiz do `auth_identity`;
4.  correção aplicada;
5.  classificação dos erros do provider;
6.  comportamento de `Retomar provisionamento`;
7.  tratamento de `session_expired`;
8.  testes executados;
9.  eventual migration e justificativa;
10. limitações de homologação externa.

------------------------------------------------------------------------

# 13. CRITÉRIOS DE ACEITE

-   [ ] `Estúdio Horizonte` não exibe `• Fictício` como parte do nome.
-   [ ] Não aparece `Demonstração local · dados fictícios` na
    experiência comercial.
-   [ ] Existe somente identificação discreta de demonstração.
-   [ ] Capa empresarial usa proporção 4:3.
-   [ ] Editor de capa trabalha em 4:3.
-   [ ] Prévia e publicação respeitam o mesmo enquadramento.
-   [ ] Imagens fora de 4:3 não são distorcidas.
-   [ ] Causa raiz do HTTP 400 em `auth_identity` foi identificada.
-   [ ] `Retomar provisionamento` funciona sem duplicar identidade.
-   [ ] Erros conhecidos do provider recebem classificação segura e
    útil.
-   [ ] `session_expired` recebe tratamento próprio.
-   [ ] Código temporário só aparece após provisionamento válido.
-   [ ] Fluxo de copiar instruções/código/link da 034 permanece.
-   [ ] Segurança e isolamento não foram enfraquecidos.
-   [ ] Build/typecheck e testes focados passam.
-   [ ] Migrations anteriores permanecem intactas.

------------------------------------------------------------------------

# 14. REGRA FINAL

Esta é uma rodada pós-034 focada nos achados reais da homologação.

Primeiro diagnosticar. Depois corrigir.

Não reconstruir funcionalidades já aprovadas.

Ao concluir:

**ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**
