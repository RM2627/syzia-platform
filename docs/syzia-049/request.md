# SYZIA 049 --- Homologação financeira, melhorias do chat e refinamento de UX

**Base obrigatória:** SYZIA 048 consolidada. **Execução:** ChatGPT Work.
**Entrega:** arquivos prontos para sobrepor na pasta atual `foundation`,
sem deploy, acompanhados de relatórios `.md` separados.

## 1. Contexto e limites

A SYZIA está publicada em `https://usesyzia.com.br`, com API em
`https://api.usesyzia.com.br` (Cloudflare Pages + Render). O backend 048
é unificado (`server/unified.mjs`). O Supabase utilizado na homologação
**será o mesmo do lançamento**: não é descartável.

Já foram validados manualmente login, painel empresarial, persistência
de informações, página pública, solicitações, mensagens, anexos enviados
pelo consumidor durante a contratação, agenda e ficha do serviço. A
página `/planos` mostra Essencial (R\$ 49,90), Profissional (R\$ 89,90)
e Equipe (R\$ 149,90), com trial de sete dias para elegíveis. Assistido
SYZIA permanece inativo.

Foram criados **seis planos na conta vendedora de teste do Mercado
Pago** (com e sem trial para cada plano). Seus IDs foram validados
contra preço, moeda, recorrência, aplicação e vendedor; o mapeamento foi
aplicado ao Supabase via
`scripts/billing-047/configure-plans.mjs --apply-test`. Não recriar os
planos, não repetir esse comando e não modificar preços nem vínculos
existentes sem justificativa e aprovação.

No Render, `MERCADO_PAGO_ENABLED=false`; há variáveis do Mercado Pago
configuradas, `MERCADO_PAGO_NOTIFICATION_AUTH=hmac` e segredo armazenado
no ambiente. Os Webhooks de teste estão configurados. A simulação de
`subscription_preapproval` recebeu HTTP 503, esperado enquanto o gateway
está desligado. **Ainda não há homologação externa de checkout,
assinatura e Webhooks com gateway ativo.**

Os testes `tests/billing-047/*.test.mjs` passaram **33/33**. Os testes
`tests/syzia-048/*.test.mjs` passaram **23/24 no Windows**. O teste
`048-H08` falha com `null !== 0` após `child.kill('SIGTERM')`; hipótese
de incompatibilidade do teste com sinais no Windows, não confirmada em
Linux. Não mascarar defeitos reais de encerramento.

Há uma pendência de cadastro: a função
`public.access_before_user_created(event jsonb)` da migration
`202609190026_enterprise_access.sql` permite identidades anônimas ou
previamente reservadas com `vireloq_provisioned=true`, enquanto o
endpoint `/access/signup` chama `signUp()` sem provisionamento anterior
evidente. O Auth Hook estava desativado no painel. Investigar e resolver
antes de ativá-lo, sem liberar cadastros indevidos nem quebrar sessões
anônimas de consumidores.

SMTP personalizado ainda não está configurado; não exigir serviços
pagos. Não inserir dados reais de usuários nos testes.

## 2. Frente A --- Homologação financeira isolada

**Objetivo:** validar a integração existente com o Mercado Pago, sem
habilitar checkout público nem reconciliação no backend publicado.

1.  Inspecionar antes de alterar `server/billing/mercado-pago.mjs`,
    `runtime.mjs`, `subscriptions.mjs`, `http.mjs`,
    `server/unified.mjs`, scripts, migrations e testes.
2.  Preparar um **harness de homologação isolado** ou procedimento
    equivalente, desativado por padrão, que use dados sintéticos,
    provedor simulado e ambiente de banco separado quando necessário.
    **Não conectar automaticamente um servidor de testes com gateway
    ativo ao Supabase de lançamento**, nem iniciar reconciliação nele.
3.  Fornecer um roteiro **operacional externo** para eu testar com as
    contas vendedora e compradora de teste: assinatura com e sem trial,
    criação/consulta, cancelamento, pagamento de teste quando suportado,
    falha/recuperação, idempotência, concorrência, webhook e
    reconciliação. Não executar transações reais ou remotas por conta
    própria.
4.  Verificar compatibilidade entre eventos reais de
    Assinaturas/Pagamentos e `x-signature`, `x-request-id`, `data.id`,
    `subscription_preapproval`, `subscription_authorized_payment` e
    `payment`; diferenciar simulador e eventos reais. Confirmar a chave
    correta por ambiente e a verificação HMAC.
5.  Manter validação server-side do recurso no Mercado Pago, vendedor,
    aplicação, `external_reference`, plano, valor, moeda, estado,
    isolamento entre empresas e idempotência. **Uma notificação assinada
    não comprova pagamento por si só.**
6.  Se precisar modificar código para testar notificações sem checkout,
    implementar o menor mecanismo seguro, restrito ao ambiente de teste
    e desligado por padrão. Nunca criar bypass público ou endpoint que
    conceda assinatura/trial.
7.  **Não ativar `MERCADO_PAGO_ENABLED=true` no Render**, não publicar,
    não modificar o banco real, não criar planos duplicados e não
    substituir IDs de teste por IDs de produção sem instrução explícita.
8.  Entregar critérios de aprovação para ativação comercial e registrar
    como **PENDENTE --- AÇÃO DO PROPRIETÁRIO** tudo que dependa de
    credenciais, painel ou eventos externos não testados pelo Work.

## 3. Frente B --- Melhorias no chat empresa ↔ consumidor

O chat já funciona. Evoluir a experiência sem reconstruir atendimento,
solicitações, propostas ou agenda.

-   **Autoscroll inteligente:** rolar para a última mensagem quando o
    usuário estiver próximo do final; preservar a posição de quem
    estiver lendo mensagens antigas e mostrar aviso discreto de novas
    mensagens.
-   **Melhor legibilidade:** agrupamento visual por remetente, horários
    claros, espaçamento consistente, texto longo e quebras de linha
    corretos, campo de composição confortável em desktop e celular.
-   **Composição:** Enter envia e Shift+Enter quebra linha no desktop,
    respeitando IME, acessibilidade e teclado móvel; bloquear envio
    duplicado e mostrar erro/reenvio seguro quando aplicável.
-   **Atualização:** novas mensagens aparecerem sem refresh manual,
    reutilizando a infraestrutura existente, sem polling excessivo ou
    duplicação.
-   **Anexos:** prévia e abertura de imagens autorizadas, estados de
    carregamento e erro. Preservar o upload na contratação e a regra
    atual que impede novos anexos depois da confirmação, a menos que uma
    mudança seja especificamente justificada e testada.
-   **Acessibilidade e segurança:** foco, navegação por teclado,
    rótulos, contraste, sanitização/XSS, privacidade das mídias,
    autorização de consumidor/empresa/atendente e isolamento
    multiempresa.
-   Não inventar confirmações de leitura, status "entregue",
    "digitando", áudio/vídeo, WhatsApp, IA ou notificações push sem
    infraestrutura real e aprovação específica. Não introduzir serviços
    pagos.

Entregar testes e demonstração reproduzível dos fluxos consumidor ↔
empresa, inclusive novas mensagens, erros, anexos e rolagem.

## 4. Frente C --- Correção pontual de UX

Na página de planos, corrigir o texto **"1 - membros da equipe"** para
**"1 membro da equipe"**. Usar **"N membros da equipe"** para N maior
que 1. Respeitar a semântica já existente para zero, ilimitado e valores
ausentes; não inventar limites.

Revisar apenas ocorrências diretamente relacionadas de singular/plural
em limites de planos. Preservar preços, funcionalidades, destaque "Mais
recomendado", trial, identidade visual e responsividade. Não redesenhar
`/planos`.

## 5. Frente D --- Segurança do cadastro

Investigar a possível incompatibilidade entre
`public.access_before_user_created` e `/access/signup`.

-   Verificar se o problema realmente ocorre e qual é o fluxo de
    provisionamento esperado.
-   Corrigir de forma mínima, se necessário, mantendo bloqueio a criação
    empresarial não autorizada e preservando as sessões anônimas dos
    consumidores.
-   Não ativar o hook no Supabase real; fornecer instruções e testes
    para ativação controlada pelo proprietário.
-   Preservar convites, recuperação, confirmação de e-mail, rate limits,
    trial, RLS e isolamento multiempresa.
-   Se houver dependências externas como SMTP ou configuração Auth,
    documentá-las; não alegar que foram homologadas.

## 6. Frente E --- Documentos do cliente e imagens na ficha de agendamento

Implementar melhorias integradas aos fluxos **já existentes**, sem
reconstruir solicitações, orçamentos, aprovações, agenda ou Storage.

### E1. Salvar orçamento para o consumidor

-   Disponibilizar a ação **"Baixar orçamento"** (preferencialmente PDF)
    no acompanhamento da solicitação, quando houver um
    orçamento/proposta disponível e autorizado para aquele consumidor.
-   O documento deve ser profissional, responsivo na geração e legível
    para impressão e celular, usando **prioritariamente a identidade visual da empresa contratada**, e não a identidade da SYZIA como marca principal. Aplicar logo, nome comercial e cores da empresa quando disponíveis e válidos; manter contraste, legibilidade e layout de impressão. Usar um visual neutro e profissional quando não houver logo/paleta configurados. A SYZIA pode aparecer apenas como assinatura discreta "Gerado com SYZIA", se apropriado; nunca substituir a marca da empresa pelo branding da plataforma.
-   Incluir somente dados reais e autorizados: empresa,
    identificação/referência da solicitação, data de emissão, serviços e
    itens, quantidades, valores unitários e totais,
    adicionais/descontos, valor total, observações, validade **somente
    se existir no sistema**, e status claramente identificado (ex.:
    proposta enviada, aprovada, recusada, expirada).
-   Diferenciar **estimativa inicial** de **proposta final**; nunca
    apresentar uma estimativa como orçamento aprovado. Se o sistema
    possuir versões históricas de propostas, preservar a correspondência
    com a versão efetivamente exibida/baixada.
-   Preservar a exatidão dos valores e a regra comercial do banco; não
    recalcular preços arbitrariamente no navegador, nem inventar
    descontos, impostos ou condições.
-   O PDF não é nota fiscal nem comprovante de pagamento. Não incluir
    declarações de quitação, CPF/CNPJ, assinatura ou numeração fiscal
    inexistentes.
-   Se houver geração server-side, manter autorização e isolamento por
    empresa/consumidor; não gerar URL pública permanente de documento
    privado. Não depender de serviço externo pago.

### E2. Baixar comprovante de agendamento

-   Disponibilizar **"Baixar comprovante"** no acompanhamento do
    consumidor **somente quando o agendamento estiver efetivamente
    confirmado**, segundo o estado canônico do sistema.
-   Usar **a mesma identidade visual da empresa contratada** (logo, nome e paleta válidos) no comprovante, mantendo aparência consistente com o orçamento. A SYZIA não deve dominar o documento. Incluir identificação da empresa, referência do
    agendamento/solicitação, serviços, data, horário, fuso horário
    quando relevante, modalidade/local ou região quando cadastrados,
    instruções reais e status **"Confirmado"**.
-   O documento deve trazer data/hora de emissão e, se o agendamento
    puder ser reagendado ou cancelado, informar que a situação atual
    deve ser conferida no acompanhamento online. Não criar QR code de
    verificação ou URL de acesso público sem autorização e implementação
    real.
-   Agendamentos pendentes, cancelados ou não confirmados não podem
    produzir comprovante que declare confirmação. Se existir comprovante
    antigo após remarcação, distinguir a versão e o estado para não
    induzir o consumidor ao erro.
-   Formato preferencial: PDF com opção de impressão, funcionando em
    desktop e dispositivos móveis, sem biblioteca paga.
-   **Comprovante de agendamento não é recibo financeiro, nota fiscal ou
    prova de pagamento.**

### E3. Imagens do cliente dentro da ficha do agendamento

-   Na **ficha do serviço/agendamento da empresa**, exibir as imagens
    que o consumidor enviou **durante a solicitação/contratação
    original**, aproveitando os vínculos e o armazenamento existentes.
-   Criar uma seção identificável, como **"Imagens enviadas pelo
    cliente"**, com miniaturas, visualização ampliada, estados de
    carregamento e erro, e identificação da origem quando disponível.
-   Mostrar somente imagens pertencentes à solicitação vinculada ao
    agendamento correto; evitar misturar arquivos de outra empresa,
    cliente ou atendimento.
-   Respeitar RLS, autorização de atendentes, acesso privado ao Storage
    e expiração de URLs assinadas. Não expor buckets privados, chaves ou
    links públicos permanentes.
-   **Não duplicar os arquivos no Storage** sem necessidade, nem alterar
    automaticamente a regra atual que impede anexar novas imagens após a
    confirmação da solicitação.
-   A seção deve funcionar para o gestor e funcionários autorizados, em
    desktop e celular, e manter o comportamento atual do consumidor.

### E4. Acesso rápido ao WhatsApp e validação do telefone

- Na visão da **empresa**, incluir uma ação clara e discreta **"Conversar pelo WhatsApp"** na solicitação, no orçamento/proposta e/ou na ficha do agendamento, aproveitando os dados de contato já associados ao cliente, sem duplicar controles em excesso.
- O botão deve abrir o WhatsApp Web ou aplicativo pelo endereço oficial `https://wa.me/<numero_normalizado>`, **somente após validação do telefone**. Abrir em nova aba quando apropriado e não enviar mensagens automaticamente.
- Oferecer, quando houver uma proposta disponível, **"Enviar orçamento pelo WhatsApp"** como ação assistida: preparar texto curto com nome da empresa, referência da solicitação, estado da proposta, valor confirmado e **link de acompanhamento autorizado, se for seguro compartilhar**. O operador deve revisar e confirmar o envio no WhatsApp.
- **Não presumir que um link de arquivo PDF privado pode ser compartilhado publicamente.** Se o orçamento não tiver URL compartilhável segura, permitir baixar o PDF e anexá-lo manualmente no WhatsApp; não criar URLs permanentes públicas nem incorporar tokens de sessão/segredos na mensagem.
- Na etapa de solicitação do consumidor, validar o número de WhatsApp/telefone de contato **na interface e no backend**. Para telefones brasileiros, aceitar formatos usuais como `(87) 99999-9999`, `87 99999-9999` e `+55 87 99999-9999`, removendo apenas caracteres de formatação e normalizando para o formato internacional `55DDDNUMERO`, sem o sinal `+` na URL `wa.me`.
- Validar **DDD de dois dígitos e número nacional de 10 ou 11 dígitos** (fixo ou celular), rejeitando valores evidentemente inválidos, números incompletos e texto arbitrário. Não usar apenas o comprimento como garantia de que o telefone existe ou possui WhatsApp. Se o sistema permitir números internacionais, preservar suporte compatível em vez de rejeitá-los arbitrariamente.
- Apresentar máscara e mensagens de erro amigáveis, sem apagar o número digitado. Não bloquear solicitações legadas com telefone ausente ou inválido: nesses casos, ocultar/desabilitar a ação com orientação adequada. **Não alterar a obrigatoriedade atual do campo sem justificativa e testes.**
- Explicar ao consumidor, próximo ao campo, que o telefone poderá ser utilizado pela empresa para contato **relacionado à solicitação**. Respeitar as regras de privacidade, finalidade, consentimento quando aplicável e retenção existentes; não transformar o contato em autorização de marketing.
- Somente usuários da empresa **autorizados a acessar aquela solicitação** podem visualizar o número e acionar o WhatsApp. Não mostrar telefone em páginas públicas, logs, analytics ou documentos compartilháveis sem necessidade.
- Não integrar API oficial paga do WhatsApp, automação de disparos, mensagens em massa, rastreamento de leitura ou notificações automáticas. O recurso é um **atalho manual** para o WhatsApp.
- Reaproveitar os componentes, contratos e fluxos de telefone existentes; se houver mudança no banco, criar migration incremental e compatível com dados antigos.

### E5. Testes obrigatórios desta frente



-   Orçamento com vários serviços, adicionais, descontos válidos,
    valores formatados em BRL, estimativa versus proposta final e
    versões/status.
-   Agendamento confirmado, pendente, remarcado e cancelado: impedir
    comprovante enganoso.
-   Download e impressão em desktop/celular, nomes de arquivo adequados,
    caracteres acentuados, textos longos e quebra de página.
-   Consumidor A não acessa documentos do consumidor B; empresa A não
    acessa imagens da empresa B; atendente sem autorização não acessa
    mídia privada.
-   Imagens existentes aparecem na ficha correta após atualização de
    página; ausência de imagens tem estado vazio adequado; links
    expirados não vazam informação.
-   WhatsApp: número com/sem `+55`, com máscara, DDD inválido, telefone incompleto, número internacional se suportado, ausência de telefone em solicitações antigas, texto pré-preenchido, URL `wa.me` e necessidade de confirmação manual.
-   Garantir que o botão não vaze dados para usuários sem permissão, não abra contato de outra solicitação e não crie disparo automático.
-   Identidade visual da empresa nos dois PDFs: logo/cores válidos, ausência de logo, contraste, caracteres longos e impressão em preto e branco.
-   Preservação dos fluxos existentes de solicitação, proposta,
    aprovação, chat e agenda.

**Entregar relatório separado
`SYZIA-049-RELATORIO-DOCUMENTOS-E-ANEXOS.md`**, detalhando
identidade visual por empresa, PDFs, imagens na ficha, botão WhatsApp, validação de telefones, permissões, testes, limitações e
capturas/evidências reais quando disponíveis.

## 7. Frente F --- Confirmação de presença, mensagens não lidas e checklist de execução

Estas três funcionalidades devem aproveitar a arquitetura atual de solicitações, atendimento, agenda, identidades, papéis e auditoria. **Não criar um segundo sistema de agendamentos ou conversas.** Preservar compatibilidade com solicitações e agendamentos já existentes e aplicar as mesmas regras de autorização e isolamento multiempresa.

### F1. Confirmação de presença pelo consumidor

- Em um **agendamento já confirmado pela empresa**, oferecer no acompanhamento do consumidor a ação **"Confirmar presença"** (ou "Confirmar que estarei presente"), identificando claramente data, hora, serviço e empresa.
- Diferenciar esse registro da **aprovação de orçamento**, da **confirmação do agendamento pela empresa**, do **pagamento** e da **conclusão do serviço**. Confirmar presença não pode aprovar proposta, gerar cobrança, alterar o horário ou concluir o atendimento.
- Registrar, com autorização, identificador do agendamento, ator autorizado, data/hora da confirmação e estado correspondente; preferir reaproveitar os estados e eventos existentes. A ação deve ser idempotente: cliques repetidos não geram registros ou notificações duplicadas.
- Mostrar no painel/agenda/ficha do serviço um indicador discreto **"Presença confirmada pelo cliente"** com data/hora, sem declarar que o cliente compareceu fisicamente.
- Permitir apenas ao consumidor legitimamente associado à solicitação confirmar a presença; nunca aceitar um ID arbitrário de outra empresa ou outro cliente. Proteger também links/códigos de acompanhamento existentes.
- Em agendamentos cancelados, expirados, concluídos ou ainda não confirmados pela empresa, não oferecer essa ação. Em remarcação, **não transportar automaticamente** a confirmação anterior para a nova data: solicitar nova confirmação, mantendo histórico/auditoria.
- Não tornar a confirmação de presença requisito para o atendimento acontecer, não alterar políticas de falta ou cancelamento e não criar mensagens automáticas ou integração paga.

### F2. Mensagens não lidas

- Mostrar **indicador de mensagens não lidas** na Home e na área de Atendimento para usuários autorizados, com contagem por conversa/solicitação e indicação visual discreta.
- Diferenciar mensagens recebidas de mensagens enviadas pelo próprio usuário; não contar mensagens próprias como não lidas. Respeitar os papéis: gestor e atendentes devem ver somente conversas às quais possuem acesso.
- Ao abrir/visualizar efetivamente uma conversa, atualizar o marcador de leitura daquele usuário, **sem marcar automaticamente como lidas para todos os funcionários**. Se houver estrutura existente de leitura, reutilizá-la; caso contrário, criar mecanismo mínimo, incremental e auditável quando necessário.
- Evitar contagens negativas, duplicações em atualizações em tempo real, regressões após refresh e vazamento de conteúdo entre empresas. Preservar desempenho em empresas com muitas conversas.
- Se não for possível oferecer contagem precisa sem alteração significativa, documentar o limite e implementar a menor solução confiável; **não exibir número fictício** nem afirmar "lida pelo cliente" sem evidência.
- Integrar os indicadores ao autoscroll e à atualização de mensagens previstos na Frente B, sem criar notificações push, WhatsApp automático ou cobrança externa.

### F3. Checklist de execução do serviço

- Na **ficha do agendamento/serviço**, oferecer um checklist de execução simples, utilizável pela empresa para acompanhar tarefas do atendimento.
- **Multissegmento por princípio:** não fixar etapas de estética automotiva, limpeza ou qualquer setor. Permitir itens personalizados por serviço/empresa quando compatível com a estrutura existente, com um conjunto inicial neutro ou lista vazia.
- O gestor e os profissionais com permissão poderão marcar/desmarcar itens; registrar quem alterou e quando, preservando auditoria e isolamento. Exibir progresso claro (ex.: "2 de 4 etapas") sem confundir checklist com status financeiro ou aprovação de proposta.
- Se houver modelos reutilizáveis por tipo de serviço, permitir configuração simples e sem exigir criação de modelo para todos. Agendamentos antigos devem continuar funcionando sem checklist.
- A conclusão de todos os itens **não deve automaticamente** finalizar o serviço, faturar, cobrar, aprovar orçamento ou alterar o agendamento. Preservar o fluxo canônico de status já existente.
- Respeitar permissões para funcionário próprio, gestor e atendimento compartilhado; não conceder a atendentes externos poderes de edição além dos grants já previstos.
- Tratar edição simultânea, refresh, ausência de itens, itens excluídos e alterações posteriores com consistência; não apagar registros históricos de serviços anteriores.

### F4. Testes obrigatórios

- Presença: agendamento confirmado, pendente, cancelado, concluído e remarcado; clique duplo; usuário não autorizado; histórico após remarcação; indicador na agenda e ficha.
- Não lidas: mensagens próprias versus recebidas, leitura individual por usuário, várias abas, reconexão/refresh, concorrência, contagem correta e isolamento entre empresas e atendentes.
- Checklist: zero/um/vários itens, persistência após refresh, permissões de gestor/funcionário, edição simultânea, item removido, serviço antigo sem checklist, multissegmento e ausência de mudanças automáticas de status.
- Regressões completas em solicitação, chat, orçamento, agenda, imagens, permissões e autenticação.

**Entregar relatório independente `SYZIA-049-RELATORIO-OPERACAO.md`**, cobrindo separadamente confirmação de presença, mensagens não lidas e checklist: alterações, fluxos, decisões, migrations, testes, limitações e evidências reproduzíveis.

## 8. Engenharia e testes obrigatórios

-   **Não reconstruir a SYZIA**, não renomear a marca e não refazer
    auditoria geral. Trabalhar somente sobre a base 048 fornecida.
-   Preservar migrations existentes byte a byte; qualquer mudança de
    banco exige migration **incremental**, nunca reset, `DROP`
    indiscriminado ou edição retroativa de migration já aplicada.
-   Não modificar dados reais, contas, preços, assinaturas ou
    configurações do Supabase/Render/Cloudflare/Mercado Pago. Sem
    deploy, push ou serviços pagos.
-   Preservar a entrada unificada em **um processo Node e uma porta**;
    não enfraquecer autenticação, CORS, RLS, controles de anexos ou
    regras de cobrança.
-   Executar testes existentes relevantes e testes novos pontuais.
    Informar total, aprovados, falhas, skips e ambiente. Se possível
    testar Linux e Windows; investigar `048-H08` sem simplesmente
    retirar a asserção de encerramento gracioso em Linux.
-   Não alegar homologação externa com base apenas em testes locais. Não
    inventar screenshots, IDs de transação ou evidências.

## 9. Entrega preparada para meu método de atualização

**Meu método:** recebo o ZIP do Work e extraio seus arquivos **sobre a
pasta `foundation` atual**, substituindo arquivos com o mesmo nome.
**Não apago a pasta inteira.**

Entregar um pacote **`SYZIA-049-ATUALIZACAO-SOBRE-048.zip`** com
estrutura de diretórios relativa à raiz de `foundation`, **sem uma pasta
`foundation` duplicada**. Pode ser pacote completo consolidado ou de
sobreposição, desde que o método e os arquivos estejam explicitados e a
substituição seja segura.

**Não incluir nem sobrescrever** `.env`, `.env.server`,
`.env.server.backup`, outros segredos, arquivos de credenciais, dumps,
backups ou `syzia-plan-mapping.local.json`. Não exigir `git clean -fdx`,
apagar a pasta ou deletar arquivos indiscriminadamente. Listar arquivos
obsoletos individualmente com motivo e instrução manual.

### Relatórios `.md` obrigatórios, separados

1.  `SYZIA-049-RELATORIO-FINANCEIRO.md` --- implementação, testes,
    riscos, pendências externas e critérios de ativação.
2.  `SYZIA-049-RELATORIO-CHAT.md` --- funcionalidades novas,
    comportamento anterior preservado, testes e limitações.
3.  `SYZIA-049-RELATORIO-DOCUMENTOS-E-ANEXOS.md` --- PDFs com identidade da empresa,
    comprovante, imagens na ficha, WhatsApp, validação do telefone, segurança e testes.
4.  `SYZIA-049-RELATORIO-UX.md` --- correções de singular/plural e
    regressões.
5.  `SYZIA-049-RELATORIO-OPERACAO.md` --- confirmação de presença,
    mensagens não lidas, checklist de execução, permissões e testes.
6.  `SYZIA-049-RELATORIO-SEGURANCA-CADASTRO.md` --- diagnóstico do Auth
    Hook, eventual correção, testes e ativação segura.
7.  `SYZIA-049-RELATORIO-TESTES.md` --- comandos, ambiente, resultados,
    falhas e pendências.
8.  `SYZIA-049-INSTALACAO.md` --- instruções de sobreposição, backup,
    migrations novas (se houver), testes, rollback, etapas futuras de
    GitHub/Render/Cloudflare executadas **por mim**.
9.  `SYZIA-049-MANIFESTO.md` --- arquivos novos, alterados, preservados,
    obsoletos e hashes quando útil.
10. `SYZIA-049-RESUMO-FINAL.md` --- o que foi entregue, o que continua
    pendente e o que impede lançamento.

Os dez documentos devem ser **arquivos individuais**, além de estarem
incluídos no ZIP, para consulta independente. Não entregar apenas um
relatório único.

## 10. Critérios de aceite

-   A versão 048 e os fluxos existentes continuam funcionando.
-   O chat está mais fluido, com autoscroll inteligente e sem perda de
    mensagens ou falhas de autorização.
-   O singular/plural em `/planos` está correto sem alterar
    preços/benefícios.
-   O consumidor consegue baixar orçamento e comprovante de agendamento com a identidade visual da empresa contratada, sem declarações fiscais ou financeiras falsas.
-   A empresa dispõe de atalho manual e seguro para WhatsApp e compartilhamento assistido do orçamento, com validação do telefone na solicitação e respeito à privacidade.
-   As imagens enviadas na contratação aparecem na ficha do agendamento
    para usuários autorizados, sem quebrar isolamento ou privacidade.
-   O cliente pode confirmar presença somente em agendamentos confirmados, sem confundir a ação com pagamento ou aprovação de orçamento; remarcação exige nova confirmação.
-   A Home e o Atendimento mostram mensagens não lidas com contagem individual confiável, sem vazamento entre usuários ou empresas.
-   A ficha do serviço permite checklist de execução configurável e multissegmento, com persistência, auditoria e sem alterar automaticamente status ou cobranças.
-   O caminho de homologação financeira está isolado, reproduzível e não
    ativa o checkout no Render.
-   A questão do Auth Hook está diagnosticada e, se confirmada,
    corrigida sem bypass.
-   Os testes são executados e documentados com honestidade.
-   O ZIP pode ser extraído sobre a pasta existente sem apagar meus
    arquivos locais, e os relatórios estão separados, incluindo os de
    documentos e anexos e de operação.

**Inicie inspecionando a base 048 fornecida. Execute as alterações
estritamente necessárias, rode os testes e entregue o ZIP e os
relatórios. Se depender de acesso externo, informe a pendência e o
procedimento que eu devo executar, sem declarar sucesso não
comprovado.**
