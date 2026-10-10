# SYZIA --- RODADA 034 PÓS-HOMOLOGAÇÃO 033

## Credenciais de primeiro acesso + mídia empresarial + enriquecimento da landing page

> Base exclusiva: **SYZIA 033**. Não reconstruir funcionalidades já
> entregues.

## 0. Regras

-   Inspecionar a 033 antes de alterar.
-   Reutilizar Auth, provisionamento, mídia, Storage, página pública e
    site institucional existentes.
-   Não criar autenticação ou mídia paralelas.
-   Não reconstruir a landing do zero; preservar a direção visual atual
    aprovada.
-   Preservar migrations 001--033.
-   Se persistência nova for indispensável, criar migration incremental
    posterior e justificar.
-   Sem reset, deploy ou produção.
-   Testes focados; não repetir auditoria mestre.
-   Não enfraquecer Auth, RLS, grants, Storage ou isolamento.
-   Não anunciar comercialmente funcionalidade inexistente.

# FRENTE 1 --- ENTREGA MANUAL DA CREDENCIAL TEMPORÁRIA

## 1. Objetivo

A 033 já possui código temporário, expiração, primeiro acesso,
invalidação/reemissão e retomada. O ajuste é **como a credencial é
entregue**.

Após Auth concluído, mostrar ao operador autorizado:

**Pessoa criada com sucesso**

Nome: Marcelo Costa\
Usuário: `marcelo.costa`\
Código temporário: `XXXXXXXX`\
Link de primeiro acesso: `[link]`

Ações: - **Copiar instruções de acesso** - Copiar código - Copiar link

O operador escolhe WhatsApp, e-mail, SMS ou outro canal. E-mail
automático não é requisito.

## 2. Copiar instruções

Gerar mensagem pronta com usuário, código, link e orientação para criar
senha. Não incluir empresa/código empresarial inexistente.

## 3. Segurança

Preservar código seguro, expirável, uso único, contexto correto e
invalidação após uso. Não permitir consulta permanente de códigos
antigos em texto puro.

Se perdido/expirado: **Gerar novo código de primeiro acesso**. O novo
invalida o anterior sem duplicar pessoa, Auth, vínculo, empresa, trial
ou papel.

## 4. Provisionamento incompleto

Se `provisioning_incomplete` ou `auth_identity` ainda não concluiu, não
mostrar código como válido.

Fluxo: cadastro reservado → Retomar provisionamento → conclusão →
emitir/reemitir credencial → mostrar código/link.

## 5. Aplicação

Funcionar em: - Pessoas e acessos → Nova pessoa; - criação de usuário
dentro de empresa; - reemissão.

Pessoa sem empresa recebe instruções compatíveis com esse estado. SMTP
não é pré-requisito.

# FRENTE 2 --- MÍDIA E ENQUADRAMENTO

## 6. Diagnóstico atualizado

Na homologação, `VITE_ATTACHMENT_GATEWAY_URL=http://127.0.0.1:8787`
estava correto, mas o gateway não estava iniciado.

Após `npm.cmd run attachments:dev`, apareceu:

`Private media gateway on loopback. External homologation pending.`

Logo e capa passaram a funcionar.

Portanto, **não tratar o erro anterior como defeito comprovado do
Supabase Storage**. A causa local comprovada foi gateway não iniciado.

Preservar bucket privado, policies, autorização, sanitização e gateway.

## 7. Readiness

Melhorar documentação/readiness para deixar claros os processos
necessários na homologação local. Gateway parado deve ser diagnosticado
como indisponibilidade do gateway.

## 8. Logo empresarial

Corrigir logo horizontal sendo tratada como avatar circular/minúsculo: -
não presumir quadrada; - não forçar círculo; - preservar proporção; -
`contain`; - horizontal/quadrada/vertical; - não cortar lettering; - sem
distorção; - responsiva; - prévia fiel à publicação.

## 9. Capa

Informar proporção/dimensões recomendadas, formatos e limite. Imagem
fora da proporção não deve necessariamente ser bloqueada.

## 10. Ajustar enquadramento

Oferecer **Ajustar enquadramento**: - mover/arrastar; - zoom; - área de
proporção; - prévia; - salvar; - sem distorção.

Inspecionar infraestrutura atual antes de escolher parâmetros
persistidos ou variante processada.

## 11. Serviço

Imagens de serviço: cards consistentes, sem distorção, enquadramento
próprio, prévia fiel e responsividade.

## 12. Portfólio

**Foto única:** preservar composição.\
**Antes/depois:** áreas equivalentes e comparação coerente.\
**Galeria:** thumbnails consistentes, layout organizado e visualização
ampliada/completa.

## 13. Regra geral

Logo → preservar/contain.\
Capa → área definida + enquadramento.\
Serviço → card consistente + regra própria.\
Portfólio → preservar trabalho com regras por formato.

Reutilizar Storage/upload existentes. Prévia deve corresponder ao
publicado.

# FRENTE 3 --- ENRIQUECIMENTO DA LANDING PAGE

## 14. Direção visual aprovada

O visual atual da landing foi aprovado.

**NÃO redesenhar do zero.**

Preservar direção escura, violeta, tipografia/hierarquia, espaçamento,
cards, navegação, linguagem visual e marca.

Objetivo: **tornar o conteúdo mais completo, convincente e demonstrativo
sem perder o visual atual.**

## 15. Problema atual

A landing possui hero, jornada resumida, recursos, segmentos, planos e
CTA, mas ainda explica pouco: - por que o empresário precisa da SYZIA; -
como entra no dia a dia; - operação solo; - evolução com equipe; -
página pública; - financeiro; - permissões; - valor da operação
conectada.

Enriquecer somente com funcionalidades reais.

## 16. Hero

Preservar:

**Sua empresa pode crescer.\
Sua operação precisa acompanhar.**

Tornar o texto auxiliar mais concreto. Conceito sugerido:

> O cliente chama por um lugar. O orçamento fica em outro. A agenda está
> separada. E os retornos dependem de você lembrar.
>
> A SYZIA conecta esses caminhos em uma única operação.

Pode adaptar sem perder o sentido. Preservar CTAs.

## 17. O problema que a SYZIA resolve

Adicionar seção curta:

### Seu negócio não deveria depender da sua memória.

Usar situações reais: orçamento sem retorno, horário em conversa,
pagamento pendente, informações espalhadas e retornos esquecidos.

Conclusão: a SYZIA conecta etapas para mostrar quem atender, o que
precisa ser feito e o que está acontecendo.

Sem dramatização ou promessa de resultado garantido.

## 18. Um dia de trabalho dentro da SYZIA

Adicionar demonstração narrativa/visual, por exemplo:

08:30 --- solicitação chega.\
08:35 --- atendimento continua com contexto.\
08:50 --- orçamento preparado.\
09:10 --- aprovação e agenda.\
14:00 --- retorno pendente.\
17:30 --- recebimento registrado e operação acompanhada.

Não inventar automações inexistentes.

## 19. Comece sozinho ou com equipe

Adicionar:

### Comece do seu jeito.

**Trabalho sozinho:** ADM opera solicitações, atendimento, orçamento,
agenda e operação.

**Tenho uma equipe:** ADM distribui responsabilidades e permissões.

**Preciso de apoio no atendimento:** quando disponível no
plano/condições, atendimento compartilhado pode apoiar dentro das
permissões definidas.

Não prometer SLA ou disponibilidade ilimitada.

## 20. Página pública

Dar destaque próprio:

### Sua empresa também ganha um lugar para ser encontrada.

Explicar identidade, serviços, preços/modalidades, horários, portfólio e
jornada do consumidor.

Quando possível, usar demonstração/mockup baseado na experiência real da
página empresarial, sem inventar UI.

## 21. Financeiro

Adicionar seção comercial sem vender contabilidade:

### Não basta saber que trabalhou. Saiba o que aconteceu.

Explicar valores a receber, recebimentos, despesas pagas/previstas,
indicadores e permissões. Não chamar projeção de lucro.

## 22. Por que SYZIA

Adicionar pilares:

**Menos ferramentas soltas** --- cliente, atendimento, orçamento, agenda
e operação conectados.

**Menos coisas para lembrar** --- pendências e retornos mostram o que
precisa de atenção.

**Mais controle** --- regras, autonomia e permissões definidas pelo
negócio.

## 23. Segurança e controle

Adicionar seção em linguagem comercial:

### Sua empresa continua no controle.

Explicar que o administrador define acessos/permissões, empresas
permanecem separadas e ações sensíveis seguem regras/auditoria.

Não citar RLS/RPC nem alegar certificações inexistentes.

## 24. FAQ

Adicionar FAQ próximo ao final, incluindo: - Preciso ter funcionários
para usar? - Posso usar minha identidade visual? - Meus funcionários
veem todo o financeiro? - A SYZIA serve apenas para um segmento? - Posso
testar antes de contratar?

A resposta sobre trial deve refletir regras/ofertas realmente
publicadas; não hardcodar benefício.

## 25. Planos e CTA final

Planos continuam vindos da infraestrutura real. Sem plano publicado,
manter estado vazio adequado.

Preservar **Criar minha empresa** e **Falar com a SYZIA** no fechamento.
Sem urgência artificial.

## 26. Ritmo da página

Não tornar a landing excessivamente longa: - evitar repetição; - usar
cards, timeline e destaques; - manter leitura escaneável; - preservar
desempenho e responsividade.

A página deve explicar melhor, não apenas ficar maior.

# TESTES FOCADOS

## 27. Credencial

Testar criação, provisionamento, exibição, copiar
código/link/instruções, primeiro acesso, senha, invalidação, reemissão e
recusa do código anterior.

## 28. Provisionamento incompleto

Falha antes da conclusão → não mostrar código → Retomar → concluir →
apresentar credencial → sem duplicação. Repetir em contexto empresarial.

## 29. Mídia

Testar logo horizontal/quadrada/vertical, capa correta/incorreta,
enquadramento, serviço, foto única, antes/depois, galeria, prévia,
publicação e recarga. Gateway parado deve ser diagnosticado
corretamente.

## 30. Landing

Testar desktop/celular/tablet relevante, navegação, CTAs, FAQ, planos
vazios/publicados, contato, self-service, acessibilidade, desempenho
básico e ausência de funcionalidades comerciais inventadas.

# BANCO

## 31. Migrations

001--033 permanecem intactas. Se enquadramento exigir persistência,
justificar e criar migration incremental posterior. Não criar migration
para mero CSS/UX.

# FORA DO ESCOPO

## 32. Não reimplementar

Não reimplementar site institucional base, self-service,
aquisição/leads, despesas recorrentes, trial/billing, login por
identidade, múltiplos contextos, username automático, sidebar ou design
system já entregues na 033.

Não fazer deploy, domínio real, provider/cobrança real, abrir Storage ou
iniciar nova fase.

# ENTREGA

## 33. Relatório

Documentar: 1. entrega manual de credenciais; 2. exposição/reemissão; 3.
provisionamento incompleto; 4. logo; 5. capa/enquadramento; 6. serviço;
7. portfólio; 8. readiness do gateway; 9. enriquecimento da landing; 10.
testes; 11. eventual migration; 12. limitações/pendências externas.

## 34. Critérios de aceite

-   [ ] Código temporário mostrado somente após provisionamento válido.
-   [ ] Copiar instruções, código e link.
-   [ ] E-mail automático não é requisito.
-   [ ] Reemissão segura sem duplicações.
-   [ ] Gateway local documentado.
-   [ ] Upload funcional não é tratado como defeito de Storage.
-   [ ] Logo horizontal não é forçada em círculo.
-   [ ] Logo preserva proporção/lettering.
-   [ ] Capa informa proporção e permite enquadramento.
-   [ ] Serviço/portfólio possuem regras adequadas.
-   [ ] Prévia corresponde à publicação.
-   [ ] Landing preserva visual aprovado.
-   [ ] Landing explica melhor problema, jornada, operação solo/equipe,
    página pública, financeiro, controle e FAQ.
-   [ ] Nenhuma funcionalidade inexistente é anunciada.
-   [ ] Responsividade/acessibilidade verificadas.
-   [ ] Migrations 001--033 intactas salvo necessidade incremental
    justificada.
-   [ ] Build/typecheck e testes focados passam.

## 35. Regra final

Esta é uma rodada pós-033 focada. Primeiro inspecionar; depois alterar
somente o necessário.

Ao concluir: **ENTREGAR E PARAR PARA HOMOLOGAÇÃO DO PROPRIETÁRIO.**
