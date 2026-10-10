# VIRELOQ --- AUDITORIA FUNCIONAL MESTRE E CONSOLIDAÇÃO FINAL

## INSTRUÇÃO PRINCIPAL

LEIA TODO ESTE DOCUMENTO ANTES DE ALTERAR QUALQUER ARQUIVO.

Esta tarefa NÃO é uma nova fase. É uma **auditoria funcional integral da
VIRELOQ**. Compare o produto completo com esta especificação, percorra
jornadas reais de cada papel, identifique divergências, corrija somente
o necessário, teste novamente, execute regressão e entregue ZIP completo
mais matriz de conformidade.

Não presuma conformidade porque existe código ou teste unitário. Não
considere homologado porque uma RPC isolada responde. As jornadas
precisam funcionar DO INÍCIO AO FIM.

Preservar tudo que estiver correto. Migrations históricas são imutáveis.
Se houver mudança persistente, criar somente migration incremental
posterior à última existente, com teste de upgrade e sem reset.

A migration 028 permitiu ao Super Admin abrir empresas sem membership.
Esta especificação refina a regra: sem ADM responsável ativo, acesso
direto; com ADM responsável ativo, autorização temporária; emergência,
somente por mecanismo excepcional auditado.

## 1. PROPÓSITO E AMBIENTES

A VIRELOQ é SaaS multiempresa para prestadores e pequenos negócios.

**Presença digital → captação → solicitação → orçamento → atendimento →
agenda → execução/acompanhamento → recuperação comercial → gestão.**

Contextos separados: - Administração VIRELOQ --- Super Admin; - Ambiente
empresarial --- operação isolada; - Experiência pública/consumidor.

Hierarquia: **Super Admin → Empresa → ADM → Colaboradores/Atendentes →
Consumidor.**

Nenhuma autorização pode depender somente de ocultação visual.

## 2. SUPER ADMIN

O Super Admin administra a VIRELOQ, não é funcionário permanente de
todas as empresas. Preservar **Acesso da operação VIRELOQ** usando Auth,
sem código de empresa fictício.

Responsabilidades: organizações, estados globais, trial,
planos/assinaturas, primeiro ADM, acessos globais, Auditoria, métricas
globais, suporte, desativação/reativação, exclusão elegível e
intervenção excepcional.

Não criar membership empresarial artificial.

## 3. LOGIN EMPRESARIAL

**Código da Empresa + Username + Senha**

Username preferencial `nome.sobrenome`, único por organização e
reutilizável em outra organização.

"Lembrar empresa" guarda somente identificação não sensível, nunca
senha/código temporário.

## 4. CÓDIGO VIRELOQ E SLUG

Código empresarial deve lembrar o nome e continuar único. Exemplo
conceitual:

**MS Auto Details → MSAUTO-7K2**

Derivar prefixo legível + componente curto de unicidade; normalizar
acentos/caracteres; evitar tamanho excessivo; resolver colisões; gerar
server-side; evitar sequência global previsível.

Não é senha, segredo, slug nem UUID. Permanece estável se nome/slug
mudarem.

Slug é separado: `MS Auto Details → ms-auto-details`, prévia
`/empresa/ms-auto-details`, editável e único. Enquanto não houver edição
manual, nome pode atualizar sugestão.

## 5. CRIAÇÃO DE EMPRESA

Permitir empresa COM ou SEM primeiro ADM.

Sem ADM: - **Aguardando administrador / Sob gestão da VIRELOQ**; -
nenhum usuário/ADM/membership fictício; - Super Admin pode
abrir/configurar diretamente.

Em **Minhas empresas**, clique principal = **Abrir empresa**.

Ações separadas: - Abrir empresa → ambiente; - Definir administrador →
provisionamento; - Pessoas e acessos → usuários; - Configurar empresa →
onboarding; - Plano e assinatura → billing; - Auditoria → global.

## 6. ACESSO DO SUPER ADMIN À EMPRESA

Sem ADM responsável ativo: Super Admin pode entrar/configurar pelo papel
global.

Com ADM responsável ativo: continua administrando cadastro, trial,
plano, assinatura e aspectos globais, mas não entra irrestritamente na
operação.

Fluxo normal: 1. solicitar acesso; 2. informar motivo; 3. ADM recebe; 4.
autoriza/recusa; 5. autorização temporária (ex. 1h/4h/24h); 6. acesso
auditado e revogável.

Registrar organização, solicitante, motivo, ADM decisor, estado,
criação, decisão, expiração, revogação e escopo quando necessário. Super
Admin não aprova a própria solicitação normal.

Criar **Acesso administrativo de emergência** separado: motivo
obrigatório, duração curta, indicação visual e auditoria explícita. Não
virar atalho normal.

## 7. MÉTRICAS GLOBAIS

Responder **Como a VIRELOQ está indo?**

Indicadores: empresas totais/ativas/em configuração/sem
ADM/trial/assinantes/suspensas; novas organizações; ativações; usuários
ativos; trials iniciados/convertidos/expirados; extensões; planos;
receita global quando billing real existir; adoção agregada; falhas;
empresas que precisam de atenção.

Preferir agregação. Drill-down global permanece administrativo e não
concede acesso operacional.

## 8. ONBOARDING E TOUR

Reutilizar onboarding existente: dados, identidade, serviços,
preços/adicionais, horários, disponibilidade, agenda, regiões,
portfólio, página pública, publicação e demais etapas. Progresso
persiste.

Tour é separado e opcional: ensina o sistema; onboarding configura a
empresa.

## 9. PRIMEIRO ADM

Pode ser criado junto ou depois. Campos: nome, sobrenome, username
sugerido, e-mail obrigatório, telefone opcional.

Provisionamento cria/prepara Auth, profile, username, membership,
`admin_empresa`, estado aguardando ativação e código temporário. O ADM
já existe antes do login.

Mostrar Empresa, Código VIRELOQ, ADM, username, código temporário,
validade e **Copiar instruções**. Tentar SMTP; falha de e-mail não
desfaz provisionamento.

## 10. PRIMEIRO ACESSO E RECUPERAÇÃO

**Código da Empresa + Username + Código temporário** → Nova senha +
Confirmar → ativar A MESMA identidade.

Não criar segunda conta/profile/membership. Definir senha via Auth,
invalidar código e auditar.

Código temporário: hash armazenado, 48h/5 tentativas por padrão, uso
único, revogável, novo invalida anterior, nunca em logs/URL/analytics.

Depois: Código + Username + Senha pessoal.

Recuperação gera novo código e invalida anterior. Ninguém vê senha
atual.

## 11. TERMOS E PRIVACIDADE

Primeiro ADM realiza aceite institucional quando aplicável. Registrar
organização, usuário, versões e data/hora.

Super Admin não aceita em nome de empresa sem ADM. Funcionário comum não
é automaticamente contratante.

Documentos versionados; não inventar dados jurídicos.

## 12. HOME EMPRESARIAL

É **O que fazer hoje?**, não dashboard decorativo.

Priorizar agenda, solicitações novas, clientes aguardando, orçamentos,
follow-ups, retornos, pendências e ações relevantes. Cards devem levar
ao contexto correto.

## 13. SERVIÇOS E PÁGINA PÚBLICA

Serviços: nome, descrição, preço fixo/a partir de/sob consulta,
adicionais, duração/disponibilidade quando aplicável, status e dados
necessários. Mesma fonte alimenta página pública, orçamento e agenda.

Página `/empresa/:slug`: identidade, descrição, serviços, preços,
adicionais, portfólio, horários, regiões, depoimentos, contato,
orçamento/agendamento. Não expor dados internos.

Portfólio/Storage respeitam isolamento, validação e URLs temporárias
quando aplicável.

## 14. CONSUMIDOR, ORÇAMENTO E AGENDA

Consumidor não é usuário empresarial. Jornada: **Página pública →
serviço → solicitação/orçamento/agendamento → acompanhamento**. Coletar
apenas dados necessários e impedir acesso a outra solicitação por troca
de ID/token.

Orçamento é por itens e possui estados coerentes conforme modelo real,
incluindo conceitos existentes como a
receber/aprovado/cancelado/realizado.

Distinguir orçamento criado, aprovado/contratado, realizado, valor
contratado e valor recebido. **Aprovação não significa pagamento
recebido.**

Agendamentos internos e públicos convergem para estrutura coerente.
Home, Agenda, Pendências, Atendimento e Orçamentos refletem mudanças
relevantes. Cancelamento/conclusão não deixa pendências ou compromissos
ativos incorretamente. Testar concorrência/overbooking conforme regras
reais.

## 15. CLIENTES E CENTRAL

Clientes são isolados por organização. Evitar duplicação desnecessária
quando houver mecanismo seguro.

Central preserva, conforme permissões: assumir, transferir, devolver à
fila, responder, nota interna, aguardar cliente/empresa, resolver,
encerrar/reabrir. Nota interna nunca é mensagem ao consumidor.

Atendentes compartilhados não recebem automaticamente administração,
configuração, billing, métricas ou Auditoria global.

## 16. PENDÊNCIAS E FOLLOW-UP

Pendências representam ações reais e deixam de aparecer como ativas
quando resolvidas.

Follow-up: 2h/6h/24h/48h/custom + limite de tentativas. Parar quando
oportunidade resolver/cancelar.

## 17. PESSOAS, PAPÉIS E ACESSOS

Área separada do onboarding. ADM provisiona usuários da própria empresa.
E-mail opcional para comum e obrigatório para ADM.

Preservar papéis reais (`super_admin`, `admin_empresa`,
`colaborador_empresa`, `own_attendant` etc.). Nenhum papel empresarial
concede `super_admin`.

Mudança de papel preserva identidade/histórico e atualiza autorização.
Usuário desativado preserva histórico e perde acesso.

Funcionário: provisionar → código temporário → ativar mesma identidade →
criar senha. Sem autocadastro público.

## 18. SESSÕES E RASCUNHOS

30 minutos de inatividade; aviso \~60s antes.

Polling, refresh automático, token/background não contam como atividade
humana. Clique, teclado e toque legítimo contam.

Múltiplas abas coordenam logout. Logout/troca de usuário/organização não
vaza rascunhos, clientes, filtros ou contexto anterior.

## 19. AUDITORIA

Auditoria global exclusiva do Super Admin em menu, rota, RPC/API e
banco/RLS.

ADM, colaborador, atendente e consumidor não acessam.

Continuar registrando eventos relevantes, inclusive suporte VIRELOQ e
emergência. Nunca senha/token/código temporário em claro.

Histórico empresarial, se existir, é separado e limitado à organização.

## 20. TRIAL, PLANOS E BILLING

Trial: 15 dias configuráveis conforme infraestrutura existente. Não
reiniciar por username, reset, exclusão ou recriação equivalente.

Preservar antifraude e extensão administrativa.

Plano/assinatura/billing existentes permanecem. Não selecionar provider,
inserir credenciais ou cobrar nesta tarefa. Limites importantes devem
ser enforced server-side.

## 21. CICLO DE VIDA DA EMPRESA

Desativar: não apaga; preserva histórico/trial/billing/auditoria;
bloqueia operação; permite reativação.

Reativar: mesma organização/usuários/histórico; sem novo trial/código
desnecessário.

Excluir: somente empresa elegível (teste, duplicada, criada por engano,
vazia/configuração abandonada sem histórico relevante), com confirmação
forte e revalidação server-side. Não usar DELETE CASCADE irrestrito.
Preservar evidências antifraude/trial/auditoria.

## 22. ESTADOS E TRANSIÇÕES

Distinguir: recém-criada, aguardando administrador, sob gestão VIRELOQ,
configuração incompleta, ADM provisionado/aguardando primeiro acesso,
ADM ativo/responsável, ativa, trial, assinante, suspensa/desativada.

ADM pendente não é ADM ativo. Quando primeiro ADM se torna responsável
ativo, muda o regime de acesso do Super Admin automaticamente.

Se todos os ADMs válidos forem removidos, empresa volta a estado
administrável pela VIRELOQ. Tratar último ADM com segurança.

## 23. MÉTRICAS E FONTE DE VERDADE

Cada métrica importante deve ter nome, definição, fonte, filtro e
estado/evento que conta.

Consultas analíticas são leitura e não produzem side effects.

Filtros respeitam período/timezone. Métricas globais não concedem acesso
operacional.

## 24. MULTISSEGMENTO

VIRELOQ não pode ficar acoplada à estética automotiva. MS Auto Details é
caso de uso.

Evitar hardcodes de carro/veículo/paciente/consulta em componentes
genéricos.

Núcleo: Empresa, Serviço, Cliente, Solicitação, Orçamento, Agenda,
Atendimento.

Não ampliar coleta de dados sensíveis por segmento sem requisito
explícito.

## 25. ISOLAMENTO MULTIEMPRESA

Empresa A nunca acessa dados de B.

Testar interface, URLs/deep links, IDs manipulados, RPCs,
PostgREST/adapters, Storage, organization_id, acompanhamento e métricas.

Preservar RLS/FORCE RLS.

Super Admin tem poderes globais de plataforma, mas acesso operacional
segue gestão VIRELOQ/autorização/emergência.

## 26. SEGURANÇA TÉCNICA

Nenhum segredo privilegiado no frontend/bundle. `VITE_` nunca contém
service_role, DATABASE_URL, senha SMTP ou segredo de provider.

Supabase Auth continua responsável pelas senhas. Identificador técnico
interno para username deve ser invisível, único e seguro.

Empresa/usuário suspenso não continua operando indefinidamente por token
antigo.

Aplicar rate limits em login, código temporário, redefinição, reenvio e
fluxos públicos sensíveis. Mensagens de login não facilitam enumeração.

## 27. CONCORRÊNCIA E IDEMPOTÊNCIA

Testar mesmo username simultâneo, provisionamento duplicado, dois
primeiros acessos, código temporário simultâneo, duas redefinições,
agenda, atendimento, orçamento, desativação durante sessão e revogação
de suporte.

Duplo clique, timeout, retry e refresh não duplicam organização,
usuário, solicitação, orçamento, agendamento, trial ou comando.

Falha parcial mostra estado real. Ex.: empresa+ADM criados e SMTP falhou
→ preservar criação e informar somente falha de entrega.

## 28. NAVEGAÇÃO E UX

Cada botão cumpre o rótulo. Testar menus, voltar, contexto,
organização/papel atual, retorno global, deep links, refresh, rota
inválida e sessão expirada.

Estados vazios orientam. Loading evita duplo envio/sucesso prematuro.
Erros úteis sem expor stack/policy/RPC.

Auditar acessibilidade básica e responsividade desktop/tablet/celular.

Preservar **VIRELOQ --- Onde caminhos se conectam.**

## 29. PUBLICAÇÃO E CONFIGURAÇÕES

Configuração e publicação são distintas quando o produto exige
publicação explícita.

Alterar nome/slug não altera Código VIRELOQ, IDs, memberships, trial ou
assinatura.

Horários/regiões configurados refletem onde aplicável.

Configurações salvas precisam ter efeito real; não manter toggles
mortos.

Manual/FAQ/Regras devem refletir o fluxo atual e remover
autocadastro/convite/login legados como caminho principal.

## 30. JORNADAS PONTA A PONTA OBRIGATÓRIAS

### Super Admin

Login → métricas globais → criar empresa sem ADM → validar código/slug →
abrir → onboarding parcial → sair/voltar → concluir → definir ADM →
credenciais → estado aguardando primeiro acesso → Auditoria → validar
mudança de regime quando ADM ficar ativo.

### Primeiro ADM

Identidade pré-existente → `/entrar` → código+username+código temporário
→ criar senha → invalidar código → aceitar documentos → Home → Pessoas e
acessos → criar funcionário.

### Funcionário

Provisionar → ativar → entrar → testar áreas permitidas/proibidas →
desativar → perder acesso → redefinir → novo código funciona/antigo não.

### Consumidor

Página pública → serviço → solicitação/orçamento/agendamento →
acompanhamento → empresa recebe → atende → orça → agenda → Home →
conclusão.

### Recuperação comercial

Condição → pendência → prazo → tentativa → próxima tentativa → limite →
resolução → cessar follow-up → métricas coerentes.

### Suporte VIRELOQ

Empresa com ADM → acesso direto recusado → solicitar → ADM autorizar →
Super Admin entrar → indicar suporte → auditar → revogar/expirar →
perder acesso.

### Emergência

Sem autorização normal → motivo obrigatório → duração limitada →
auditoria → acesso controlado → expiração.

### Ciclo de vida

Desativar → bloquear operação → preservar histórico → reativar → mesma
organização/trial. Testar exclusão elegível e recusa de empresa não
elegível.

### Isolamento

Criar Empresa A e B e tentar cross-tenant por UI, URL, ID, RPC,
adapters/PostgREST, Storage, acompanhamento e métricas.

### Responsividade

Executar jornadas críticas em desktop, tablet e celular.

## 31. TESTES ENTRE MÓDULOS

Não testar módulos como ilhas.

Validar:

**Serviço → Página pública → Solicitação → Atendimento → Orçamento →
Agenda → Home → Pendência → Métrica**

Mudanças anteriores devem refletir onde necessário nas etapas
posteriores.

Testar cancelamento, conclusão e execução para eliminar estados
divergentes.

## 32. TESTES NEGATIVOS

Incluir:

-   login errado;
-   empresa errada;
-   username errado;
-   código temporário errado/expirado/reutilizado;
-   sessão expirada;
-   empresa suspensa;
-   usuário desativado;
-   papel insuficiente;
-   slug duplicado;
-   username duplicado;
-   SMTP indisponível;
-   upload inválido;
-   retry/duplo clique;
-   cross-tenant;
-   suporte não autorizado;
-   autorização expirada/revogada.

## 33. MATRIZ DE PERMISSÕES

Produzir matriz real para:

-   Super Admin;
-   admin_empresa;
-   colaborador_empresa;
-   atendente próprio;
-   atendente compartilhado, se aplicável;
-   consumidor.

Para cada área/ação: visualizar, criar, editar, excluir, usuários,
métricas, billing, Auditoria, configuração, atendimento, papel, suporte.

Referência: - Super Admin: global; empresa sem ADM direta; com ADM
somente autorização; emergência auditada. - ADM: própria empresa;
equipe; métricas próprias; sem Auditoria global. - Colaborador: módulos
concedidos; sem poderes globais. - Atendente: atendimento permitido; sem
métricas/configuração/billing por padrão. - Consumidor: público +
própria solicitação.

## 34. AUDITORIA DE CONFORMIDADE

Antes de alterar, mapear:

**REQUISITO → ARQUIVO/FUNÇÃO/RPC/POLICY → ESTADO ATUAL → TESTE →
DIVERGÊNCIA → CORREÇÃO → TESTE FINAL**

Classificar cada requisito:

-   CONFORME;
-   PARCIALMENTE CONFORME;
-   NÃO CONFORME;
-   NÃO IMPLEMENTADO;
-   LEGADO;
-   PENDENTE DE HOMOLOGAÇÃO EXTERNA.

Não marcar conforme por inferência do nome de arquivo.

Corrigir automaticamente divergências determinadas por esta
especificação. Quando houver múltiplas regras de negócio possíveis não
definidas, preservar comportamento seguro ou marcar **DECISÃO DE PRODUTO
PENDENTE**.

## 35. REFINAMENTO DA MIGRATION 028

Auditar especificamente a autorização da 028.

Regra definitiva:

-   sem ADM responsável ativo → Super Admin direto;
-   ADM provisionado mas ainda pendente → continua sob gestão VIRELOQ;
-   ADM responsável ativo → autorização temporária;
-   emergência → mecanismo excepcional.

Não editar 028. Se necessário, criar migration incremental.

Não exigir membership artificial.

Não criar aprovações retroativas para empresas existentes.

Depois do upgrade, empresas com ADM ativo devem exigir autorização para
novo acesso operacional do Super Admin.

## 36. SOLICITAÇÕES DE SUPORTE

Se não existir estrutura adequada, criar modelo persistente com
organização, solicitante, ADM decisor, motivo, estado, datas, expiração,
revogação e escopo.

ADM deve perceber solicitação dentro da plataforma, sem depender de
SMTP.

Com múltiplos ADMs, qualquer ADM autorizado pode decidir conforme regra
existente; registrar quem decidiu.

ADM deve poder visualizar acessos VIRELOQ ativos e revogar.

A empresa deve ter visibilidade apropriada de que houve acesso VIRELOQ à
própria organização, sem receber Auditoria global.

## 37. PRIVACIDADE POR DESIGN

Super Admin deve administrar a VIRELOQ sem precisar abrir dados
operacionais de todas as empresas.

Suporte continua possível por três caminhos:

1.  empresa sem ADM / sob gestão VIRELOQ;
2.  autorização temporária do ADM;
3.  emergência auditada.

Home VIRELOQ e Home empresarial são experiências diferentes.

## 38. HOME DA ADMINISTRAÇÃO VIRELOQ

Se existir dashboard global, priorizar:

-   saúde da plataforma;
-   empresas novas;
-   ativações pendentes;
-   empresas sem ADM;
-   configurações incompletas;
-   solicitações de suporte;
-   trials;
-   assinaturas;
-   problemas administrativos.

Não copiar a Home empresarial.

## 39. TRANSIÇÃO DE RESPONSABILIDADE

Jornada conceitual:

Super Admin cria empresa → VIRELOQ gera slug+código → empresa fica sob
gestão VIRELOQ ou recebe ADM → onboarding → ADM provisionado → código
temporário → ADM cria senha → aceite legal → ADM se torna responsável →
equipe → publicação → consumidor → operação → métricas.

A transição **Sob gestão VIRELOQ → Gestão do ADM** deve ser automática e
determinística quando o ADM se torna responsável ativo.

Se todos os ADMs forem desativados/revogados, não deixar a empresa órfã.

## 40. CÓDIGO EMPRESARIAL --- TESTES

Testar nomes:

-   iguais;
-   semelhantes;
-   curtos;
-   longos;
-   acentuados;
-   números;
-   caracteres especiais;
-   Unicode.

Gerador deve produzir código válido, legível e único, sem loop.

Mostrar código em confirmação de criação, Administração VIRELOQ, gestão
de acesso e instruções. Não expor sem finalidade na página pública.

## 41. ESTADO DE USUÁRIO E REENVIO

Distinguir:

-   aguardando ativação;
-   ativo;
-   desativado;
-   redefinição pendente;
-   código expirado quando relevante.

Reenvio não cria usuário novo. Se gerar novo código, invalida anterior,
atualiza validade, registra evento e aplica rate limit.

## 42. AUTOCADASTRO E FLUXOS LEGADOS

Não permitir autocadastro público de empresa ou usuário empresarial.

Identificar estruturas legadas e classificar:

-   ATIVO;
-   LEGADO;
-   DESCONTINUADO;
-   FUTURO.

Convites antigos podem permanecer como histórico, mas não devem
reaparecer como caminho principal.

## 43. MÉTRICAS --- DEFINIÇÕES

No relatório final, documentar principais métricas:

**NOME → DEFINIÇÃO → FONTE → FILTRO → EVENTO/ESTADO QUE CONTA**

Consultas analíticas são leitura e não alteram dados.

Filtros de período devem respeitar timezone.

## 44. PLANOS E EXPIRAÇÃO DE TRIAL

Auditar integração entre autenticação e autorização comercial.

Auth confirma identidade; trial/assinatura determina disponibilidade
comercial conforme regras existentes.

Não inventar downgrade, reembolso, carência ou retenção comercial se não
estiver definido. Marcar como decisão pendente.

Não fingir checkout real quando provider estiver não configurado.

## 45. DATAS, TIMEZONE E REDE

Auditar datas/horários para evitar compromisso mudar de dia, validade
incorreta, trial/filtro divergente.

Validade de código é server-side; interface apenas apresenta no timezone
apropriado.

Em falha de rede: não mostrar sucesso antes da confirmação; preservar
formulário quando seguro; permitir retry idempotente.

## 46. TROCA DE CONTEXTO E LOGOUT

Ao trocar empresa, atualizar completamente contexto e impedir vazamento
de cliente, rascunho, métrica, filtro, atendimento ou cache da anterior.

Autorização de suporte para A não vale para B.

Ao voltar à Administração VIRELOQ, limpar contexto empresarial
transitório quando necessário.

Logout encerra sessão, limpa contexto e rascunhos sensíveis. Pode
preservar apenas preferência não sensível como empresa lembrada.

Usuário B nunca recebe dados do usuário A no mesmo navegador.

## 47. ERROS, RATE LIMIT E BRUTE FORCE

Não mostrar stack trace/policy/RPC ao usuário final.

Aplicar limites em login, código temporário, redefinição, reenvio,
primeiro acesso, solicitações públicas suscetíveis a abuso e suporte.

Proteger tentativa de descobrir Código da Empresa, username, código
temporário ou senha.

CAPTCHA só deve ser declarado ativo se realmente configurado.

## 48. QUALIDADE TÉCNICA

Validar instalação limpa:

`npm ci`

`npm run build`

Executar TypeScript/typecheck real. Não mascarar problemas com `any`
generalizado.

Auditar dependências sem atualizar majors indiscriminadamente.

Executar inspeção do bundle para segredos/server-only.

Logs devem ser coerentes e não usar nomenclatura obsoleta enganosa.
Nunca logar senha, token, service_role, código temporário ou segredo
SMTP.

## 49. TESTES DE BANCO E NAVEGADOR

Executar todos os testes SQL disponíveis e adicionar cobertura para
novas regras.

Quando PostgreSQL nativo não puder rodar, não declarar aprovado;
preparar scripts e documentar.

Executar jornadas reais em navegador, incluindo mobile. Adapters/fakes
são úteis, mas devem ser identificados como tal.

Não confundir adapter com Supabase real.

## 50. HOMOLOGAÇÃO EXTERNA

Esta tarefa NÃO autoriza acesso ao Supabase real.

Marcar como pendentes quando aplicável:

-   Auth real;
-   JWT/renovação real;
-   PostgREST real;
-   Storage real;
-   SMTP real;
-   concorrência remota;
-   billing/provider real.

Não enviar e-mail real. Não cobrar. Não inserir credenciais reais.

Usar somente dados fictícios.

## 51. MIGRATIONS E UPGRADE

Nunca alterar migrations históricas.

Se nova regra exigir schema/policy/RPC, criar migration incremental.

Testar upgrade a partir da última migration da entrega-base.

Preservar organizações, memberships, configuração, trial, billing,
auditoria e dados.

Não pedir reset.

Não criar autorização retroativa que ADM nunca aprovou.

## 52. REGRESSÃO COMPLETA

Executar regressão de todos os módulos existentes, inclusive os não
citados explicitamente que já façam parte do produto.

No mínimo:

-   Fundação;
-   Super Admin;
-   organizações;
-   onboarding;
-   autenticação;
-   primeiro acesso;
-   recuperação;
-   sessões;
-   usuários/papéis;
-   Home;
-   serviços;
-   página pública;
-   portfólio;
-   clientes;
-   orçamentos;
-   agenda;
-   atendimento;
-   pendências;
-   follow-up;
-   consumidor;
-   acompanhamento;
-   Central;
-   Comercial;
-   Analytics;
-   métricas;
-   trial;
-   billing;
-   Termos/Privacidade;
-   Storage/imagens;
-   notificações;
-   configurações;
-   multissegmento;
-   suporte VIRELOQ;
-   Auditoria;
-   responsividade.

Nenhum teste deve ser considerado aprovado por retry silencioso. Se
houver flake, documentar a primeira falha, investigar e repetir
controladamente.

## 53. DIA DE USO COMPLETO

Executar um cenário integrado com dados fictícios:

1.  Super Admin entra.
2.  Cria empresa sem ADM.
3.  Confere Código VIRELOQ e slug.
4.  Abre empresa.
5.  Faz onboarding.
6.  Sai e retorna, confirmando persistência.
7.  Define primeiro ADM.
8.  Obtém código temporário.
9.  ADM ativa a mesma identidade.
10. Cria senha.
11. Aceita documentos.
12. ADM cria funcionário.
13. Funcionário ativa.
14. Empresa publica presença.
15. Consumidor abre página.
16. Solicita serviço/orçamento/agendamento.
17. Empresa recebe.
18. Atendimento processa.
19. Orçamento é criado.
20. Agenda é atualizada.
21. Home reflete ação.
22. Pendência/follow-up funciona.
23. Serviço é concluído/cancelado e módulos refletem corretamente.
24. Métricas empresariais ficam coerentes.
25. Métricas globais refletem somente o que é apropriado.
26. Super Admin tenta reentrar após ADM ativo e é bloqueado pelo fluxo
    normal.
27. Solicita suporte.
28. ADM autoriza.
29. Super Admin entra temporariamente.
30. ADM revoga ou acesso expira.
31. Super Admin perde acesso operacional.
32. Testar emergência controlada.
33. Desativar e reativar empresa.
34. Confirmar isolamento contra outra organização.

Essa jornada é obrigatória porque atravessa a plataforma como produto
real.

## 54. MATRIZ DE CONFORMIDADE FINAL

Entregar tabela com:

-   ID/requisito;
-   comportamento esperado;
-   implementação localizada;
-   estado inicial;
-   divergência;
-   correção;
-   teste associado;
-   resultado final;
-   pendência externa, se houver.

Estados finais permitidos:

-   CONFORME;
-   PARCIALMENTE CONFORME;
-   PENDENTE DE HOMOLOGAÇÃO EXTERNA;
-   DECISÃO DE PRODUTO PENDENTE.

Não deixar NÃO CONFORME/NÃO IMPLEMENTADO sem justificativa explícita ao
final se esta especificação determinava claramente a correção.

## 55. MATRIZ DE PERMISSÕES FINAL

Entregar matriz para:

-   Super Admin;
-   admin_empresa;
-   colaborador_empresa;
-   atendente próprio;
-   atendente compartilhado, se existir;
-   consumidor.

Cobrir, conforme aplicável:

-   Administração VIRELOQ;
-   empresa;
-   onboarding;
-   serviços;
-   clientes;
-   orçamento;
-   agenda;
-   atendimento;
-   pendências;
-   métricas;
-   usuários;
-   billing;
-   Auditoria;
-   configuração;
-   página pública;
-   suporte VIRELOQ;
-   autorização/revogação;
-   exclusão/desativação.

## 56. RELATÓRIO FINAL

Entregar relatório com:

1.  resumo executivo;
2.  arquitetura funcional encontrada;
3.  divergências;
4.  causas-raiz;
5.  correções;
6.  decisões preservadas;
7.  decisões pendentes;
8.  migration nova, se houver;
9.  integridade das migrations históricas por hash;
10. testes executados;
11. resultados;
12. falhas iniciais/retries documentados;
13. segurança/RLS;
14. isolamento;
15. jornadas;
16. responsividade;
17. métricas;
18. suporte autorizado;
19. acesso emergencial;
20. pendências de Supabase/SMTP/Storage/billing real.

## 57. GUIA DE ATUALIZAÇÃO

Entregar upgrade sem reset para instalação existente.

Orientar:

-   preservar `.env` e `.env.server` locais;
-   substituir pelos arquivos consolidados da nova entrega;
-   `npm ci`;
-   aplicar somente migration incremental nova, se houver;
-   build;
-   reiniciar processos;
-   validar Super Admin;
-   validar empresa sem ADM;
-   validar ADM;
-   validar suporte autorizado;
-   executar roteiro de homologação.

Nunca mandar reaplicar migrations históricas.

## 58. ENTREGA

Entregar **UM ZIP COMPLETO E CONSOLIDADO**, não patch.

Não incluir:

-   `.env` preenchido;
-   `.env.server` preenchido;
-   credenciais;
-   dados reais;
-   service_role;
-   DATABASE_URL;
-   senha SMTP.

Não fazer deploy. Não acessar Supabase real. Não enviar e-mail real. Não
executar cobrança. Não produzir vídeo.

O vídeo permanece suspenso.

## 59. CRITÉRIOS FINAIS DE ACEITE

A auditoria só está pronta quando:

-   navegação é coerente;
-   Código VIRELOQ é legível/único/estável;
-   slug é separado;
-   empresa pode nascer com ou sem ADM;
-   empresa sem ADM pode ser configurada pelo Super Admin;
-   empresa com ADM exige autorização para acesso operacional;
-   emergência é separada e auditada;
-   primeiro ADM/funcionário ativam a mesma identidade provisionada;
-   SMTP falho não desfaz criação;
-   sessões/inatividade funcionam;
-   Auditoria global é exclusiva;
-   isolamento multiempresa permanece forte;
-   Home/Agenda/Pendências/Atendimento/Orçamento conversam;
-   consumidor acompanha somente sua solicitação;
-   follow-up encerra corretamente;
-   métricas globais e empresariais são separadas;
-   trial não reinicia indevidamente;
-   ciclo de vida da empresa é coerente;
-   responsividade funciona;
-   build/typecheck passam;
-   testes pertinentes passam;
-   migrations históricas permanecem intactas;
-   ZIP é completo;
-   pendências externas são declaradas honestamente.

## 60. REGRA FINAL

Esta especificação é a referência funcional mestre da VIRELOQ.

Não utilizar esta auditoria para reinventar o produto ou iniciar uma
nova fase.

Primeiro compreenda o que já existe. Depois compare. Depois corrija
divergências determinadas. Depois teste a plataforma como um sistema
integrado.

Preservar tudo que já estiver correto.

Quando uma decisão importante não estiver definida aqui e houver mais de
uma solução legítima, não inventar regra de negócio: registrar **DECISÃO
DE PRODUTO PENDENTE**.

Ao concluir, entregar o projeto completo, os relatórios e PARAR para
nova homologação pelo proprietário.
