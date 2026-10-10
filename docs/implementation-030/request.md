# VIRELOQ --- IMPLEMENTAÇÃO 030

## Prompt mestre para o Work

**Leia tudo antes de alterar qualquer arquivo.** Parta da entrega
consolidada 029. Preserve o produto atual e implemente somente este
escopo.

## Regras inegociáveis

-   Migrations 001--029 permanecem byte a byte intactas.
-   Se necessário, criar somente a migration 030 incremental.
-   Upgrade 029→030 sem reset e preservando dados.
-   Preservar RLS/FORCE RLS, constraints, auditoria e isolamento
    multiempresa.
-   Não acessar Supabase real, fazer deploy, enviar e-mail real,
    executar cobrança real ou inserir credenciais.
-   Usar dados fictícios; separar teste local de homologação externa.
-   Não criar sistemas paralelos quando a infraestrutura atual puder ser
    evoluída.
-   Executar regressão completa.

# 1. Financeiro empresarial

Criar **Visão geral \| Contas a receber \| Recebimentos \| Despesas \|
Caixa \| Calculadoras**. O Financeiro empresarial é separado do billing
da VIRELOQ.

Contas a receber podem nascer de orçamento aprovado quando aplicável ou
ser criadas manualmente por usuário autorizado. Suportar cliente,
origem, orçamento/serviço/agendamento relacionados, total, recebido,
saldo, vencimento, observações, status e histórico. Estados conceituais:
pendente, parcialmente paga, paga, vencida e cancelada.

Permitir sinal e múltiplos recebimentos. Saldo é calculado pelos
lançamentos válidos.

Recebimentos registram valor, data, forma (Pix, dinheiro, débito,
crédito, transferência, outro), observação e vínculos. Somente
recebimento efetivamente registrado alimenta receita recebida.

Regra obrigatória: **ORÇADO ≠ APROVADO/CONTRATADO ≠ REALIZADO ≠
RECEBIDO**.

Recebimento confirmado não some silenciosamente. Estorno/correção deve
referenciar lançamento original, ator, motivo, data, efeito financeiro e
auditoria. Inicialmente, estorno/cancelamento de recebimento confirmado
é restrito ao ADM.

Despesas: descrição, categoria configurável, valor, data, forma de
pagamento, observação e ator.

Caixa: entradas, saídas, resultado do período e a receber, com filtros
hoje/semana/mês/personalizado. Não chamar de lucro líquido contábil.

## Calculadoras

-   Precificação: materiais + mão de obra/tempo + deslocamento +
    outros + margem → preço sugerido.
-   Resultado/Margem: preço cobrado + custos → resultado bruto estimado
    e margem.
-   Desconto: preço + desconto → valor final e impacto na margem quando
    houver dados.
-   Meta: meta financeira + ticket médio → quantidade aproximada de
    serviços.

São simulações. Não alterar dados sem ação explícita/autorizada.

Integrar: **Cliente → Solicitação → Atendimento → Orçamento → Aprovação
→ Agenda → Execução → Recebimento → Financeiro → Métricas**.

# 2. Métricas 2.0

Evoluir a aba existente, sem criar dashboard concorrente.

Operacionais/comerciais: solicitações, orçamentos, aprovações,
conversões, agendamentos, realizados, clientes, atendimento, follow-up e
métricas atuais válidas.

Financeiras: orçado, aprovado/contratado, realizado, recebido, a
receber, despesas, resultado, pendentes/vencidos e ticket médio quando
sustentado por dados.

Quando houver dados: **ORÇADO → APROVADO → REALIZADO → RECEBIDO**.

Filtros: hoje, 7 dias, 30 dias, mês e personalizado, respeitando
timezone. Não inventar margem por serviço sem custos confiáveis nem
rankings invasivos.

# 3. Permissões granulares em toda a plataforma

Permissões granulares NÃO são exclusivas do Financeiro. O ADM define o
acesso de funcionários/atendentes próprios dentro dos limites do produto
e do plano.

Áreas: Home, Clientes, Atendimento, Orçamentos, Agenda, Pendências,
Follow-up, Serviços, Portfólio, Página pública, Financeiro, Métricas,
Pessoas e acessos e Configurações.

**Papel ≠ permissão.** Papel define base/limite máximo; permissões
definem acesso efetivo.

Autorização efetiva deve resultar conceitualmente de: **papel
permitido + capacidade do plano + permissão concedida + escopo
autorizado + estado válido**.

**Permissão = ação autorizada + escopo autorizado.**

Não usar apenas `financial_access=true/false`. Separar ao menos: ver
valores de orçamentos; ver contas a receber; registrar recebimentos; ver
histórico autorizado; criar/gerenciar contas; registrar/ver/gerenciar
despesas; ver caixa; ver recebimentos consolidados; ver resultado; usar
calculadoras; ver métricas financeiras.

Cenário obrigatório: funcionário pode ver **Serviço R\$170 / Recebido
R\$50 / Pendente R\$120** e registrar o restante, sem poder
necessariamente ver receita total, despesas gerais, caixa, resultado ou
métricas consolidadas.

Dados consolidados exigem permissões superiores específicas.

ADM administra a própria empresa dentro das capacidades do plano e nunca
cria Super Admin.

Atendente próprio recebe permissões/autonomias definidas pelo ADM.

Atendente compartilhado NÃO é criado/atribuído pelo ADM; a atribuição é
da VIRELOQ/Super Admin e depende do plano. Depois, ADM define autonomias
dentro do máximo permitido. Não recebe automaticamente administração,
billing, caixa, resultado, métricas financeiras, Pessoas e acessos,
Auditoria global ou configurações.

Enforcement obrigatório em UI, rota, API/RPC e banco/RLS quando
aplicável. Não basta esconder menu. Revogação deve surtir efeito em
sessões existentes.

Evoluir Pessoas e acessos para configuração por módulos/ações. Presets
opcionais podem ser atalhos, nunca substituir permissões explícitas.

# 4. Categorias reutilizáveis de serviços

Ao cadastrar uma categoria pela primeira vez, ela fica salva para aquela
organização. Próximos serviços podem selecionar existente ou criar nova.

Permitir criar, renomear, ordenar, desativar e excluir quando seguro.
Idealmente categoria vira entidade vinculada ao serviço, não texto
duplicado. Categoria em uso não deve ser apagada destrutivamente.

Página pública pode agrupar serviços por categoria. Isolamento por
organização obrigatório.

# 5. Planos e Atendimento Compartilhado

NÃO recriar planos/billing. Evoluir infraestrutura existente de planos,
versões, trial e assinaturas.

Planos passam a determinar capacidades/entitlements sem hardcode por
nome. Não usar `if plan == "Essencial"`.

Capacidade obrigatória inicial: **Atendimento Compartilhado VIRELOQ:
disponível/indisponível**.

Plano sem essa capacidade: ADM/equipe própria podem atender; cliente não
ativa compartilhado; **nem o Super Admin consegue atribuir atendente
VIRELOQ**; backend/banco recusam.

Plano elegível: Super Admin pode atribuir atendentes compartilhados.
Cliente não escolhe arbitrariamente atendentes da operação.

Downgrade para plano sem o recurso suspende vínculos compartilhados,
preserva histórico e bloqueia novas operações desses atendentes.

Não definir agora preços, nomes comerciais, franquias ou SLA.

# 6. Novo primeiro acesso, CPF/CNPJ e trial

Fluxo: **Super Admin cria empresa + provisiona primeiro ADM → Código
VIRELOQ + username + código temporário → primeiro acesso → cria senha →
aceita Termos/Privacidade quando aplicável → verificação obrigatória
CPF/CNPJ → elegibilidade automática quando aplicável → ativação
operacional.**

Criar senha sozinho não libera operação plena quando a verificação é
obrigatória.

Tela simples: **Verifique seu cadastro** → Pessoa física/CPF ou Pessoa
jurídica/CNPJ → Documento → Continuar. Não expor
`PAÍS:TIPO:IDENTIFICADOR`.

Normalizar CPF/CNPJ e validar estrutura/dígitos verificadores. NÃO
descrever isso como consulta oficial, comprovação de existência ou
titularidade.

Minimizar exposição; usar representação segura/hash para antifraude
quando apropriado. Se persistência integral for indispensável,
justificar e restringir. Visualizações posteriores mascaradas quando
possível. Nunca logar documento completo.

Estados: **Aguardando primeiro acesso → Aguardando verificação → Em
análise (quando necessário) → Ativa**.

Após verificação, usar histórico interno da VIRELOQ para decidir
elegibilidade. Trial já utilizado pode resultar em **Cadastro verificado
/ Novo trial indisponível**. Não elegível ao trial não significa
proibido de contratar.

A tela técnica atual de verificação administrativa deixa de ser fluxo
normal e vira ferramenta excepcional, com decisão, motivo, ator, data e
Auditoria.

# 7. Empresa sob gestão VIRELOQ e interna/isenta

Preservar: empresa sem ADM responsável ativo pode ficar **Sob gestão da
VIRELOQ**, com acesso direto do Super Admin sem membership artificial.
ADM provisionado mas ainda não ativo não bloqueia prematuramente essa
gestão.

Separar **responsabilidade operacional** (gestão VIRELOQ/ADM) de
**situação comercial** (trial/assinante/interna-isenta/etc.).

Adicionar situação **Empresa interna/isenta** para empresas próprias,
como MS Auto Details: - trial não aplicável; - sem elegibilidade de
trial; - sem assinatura paga; - sem expiração por falta de cobrança; -
recursos completos conforme concessão; - segurança/RLS/auditoria
continuam normais.

Empresa sem ADM NÃO vira gratuita automaticamente. Somente Super Admin
concede/remove isenção. Registrar tipo, motivo, ator, data, estado e
Auditoria. Não implementar apenas `is_free=true`.

Criar ADM futuramente não remove automaticamente a isenção.

A MS Auto Details deve poder ser marcada interna/isenta, sem trial
artificial ou assinatura de si mesma, inclusive podendo usar atendimento
compartilhado quando configurado.

# 8. Erro de acesso encontrado

Revisar o caso em que Super Admin configurando empresa sem ADM, sob
gestão VIRELOQ, recebeu mensagem "conta suspensa ou sem confirmação de
e-mail" após revalidação.

Teste obrigatório: **Super Admin ativo → empresa sem ADM → gestão
VIRELOQ → onboarding → salvar/navegar → revalidar acesso → continuar
autorizado.**

Empresa interna/isenta não pode ser bloqueada por trial/elegibilidade.

Mensagens devem distinguir, quando seguro, sessão expirada, empresa
suspensa, usuário desativado, aguardando verificação, plano/situação
comercial, suporte não autorizado e falha técnica. Não atribuir causa
falsa. Login continua genérico contra enumeração.

# 9. Testes obrigatórios

Testar upgrade **029→030** preservando dados existentes.

Permissões: testes positivos/negativos para ADM, colaborador, atendente
próprio, compartilhado, Super Admin e consumidor; testar UI e acesso
direto por rota/API/RPC/banco quando aplicável.

Financeiro: conta manual/por orçamento, parcial, sinal, múltiplos
recebimentos, quitação, vencimento, despesa, caixa, estorno,
idempotência, concorrência, isolamento A/B e cenário de cobrança
individual sem consolidados.

Métricas: validar definição/fonte; dashboard sem side effects; usuário
sem permissão não recebe consolidados pela API.

Categorias: criação, reutilização, renomeação, ordenação, desativação,
categoria em uso, isolamento e upgrade.

Planos: capacidade ausente bloqueia inclusive Super Admin; capacidade
presente permite atribuição; downgrade suspende e preserva histórico.

Ativação: CPF/CNPJ estruturalmente válidos/inválidos, primeiro acesso,
senha, aguardando verificação, elegibilidade, trial usado, revisão
manual, empresa interna/isenta e ausência de documento em logs. Não
alegar validação governamental.

Testar concorrência/retry/duplo clique em lançamentos, permissões,
categorias, atribuição compartilhada e ativação.

Auditar responsividade desktop/tablet/celular e
segurança/RLS/bundle/logs/revogação.

# 10. Preservar

Não quebrar: Código VIRELOQ, autenticação, Super Admin, onboarding,
serviços, página pública, portfólio, Central/chat, clientes, orçamentos,
agenda, pendências, follow-up, manual, FAQ, respostas rápidas, equipe,
suporte autorizado da 029, acesso emergencial, trial, billing,
Termos/Privacidade, Auditoria, isolamento multiempresa, RLS/FORCE RLS e
identidade VIRELOQ.

# 11. Fora do escopo

Não implementar agora: - Open Finance; - integração/conciliação
bancária; - emissão fiscal; - DRE contábil completa; - folha; -
estoque; - gateway novo; - consulta governamental externa de CPF/CNPJ; -
preços definitivos dos planos; - SLA/franquias definitivos do
atendimento compartilhado.

# 12. Entregáveis

Entregar: 1. ZIP completo consolidado, não patch. 2. Migration 030, se
necessária. 3. Relatório técnico. 4. Matriz de permissões final. 5.
Matriz de capacidades dos planos. 6. Definições das métricas. 7.
Relatório de segurança/RLS. 8. Testes executados e resultados. 9. Teste
de upgrade 029→030. 10. Guia de atualização sem reset. 11. Pendências de
homologação externa. 12. Lista de decisões de produto ainda pendentes.

Não incluir `.env`/`.env.server` preenchidos, credenciais ou dados
reais.

# 13. Critérios finais de aceite

A entrega só está pronta quando: - Financeiro diferencia
orçado/aprovado/realizado/recebido. - Pagamentos parciais e despesas
funcionam. - Calculadoras são simulações seguras. - Métricas usam fontes
reais. - Permissões granulares funcionam em toda a plataforma. - Acesso
individual a cobrança não revela automaticamente consolidados. -
Categorias são reutilizáveis e isoladas. - Atendimento compartilhado é
realmente condicionado ao plano. - Novo ADM precisa concluir verificação
quando aplicável. - Elegibilidade normal é automática. - Revisão manual
é exceção. - Empresa interna/isenta funciona fora do ciclo
trial/assinatura. - MS Auto Details pode ser interna/isenta. - Super
Admin não perde acesso indevidamente a empresa sob gestão VIRELOQ. -
001--029 permanecem intactas. - Upgrade 029→030 funciona sem reset. -
Regressão não quebra módulos anteriores.

## REGRA FINAL

Primeiro inspecione e mapeie a implementação 029. Reutilize estruturas
corretas. Corrija somente o necessário. Não invente regras comerciais
não definidas. Se houver decisão importante sem definição, registre como
**DECISÃO DE PRODUTO PENDENTE**.

Ao concluir, entregue o projeto consolidado e PARE para homologação do
proprietário.
