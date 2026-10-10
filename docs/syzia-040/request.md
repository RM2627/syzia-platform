# SYZIA 040 --- RODADA PÓS-HOMOLOGAÇÃO 039

## Prompt mestre --- planos, permissões, Equipe SYZIA, fluxo operacional e experiência do consumidor

> Leia todo este documento antes de alterar qualquer arquivo.

Base: **SYZIA 039 consolidada**. Esta rodada contém somente alterações
aprovadas durante a homologação manual posterior à 039.

## 0. Regras inegociáveis

-   Inspecionar a 039 e diagnosticar a causa real antes de corrigir.
-   Reutilizar estruturas, RPCs, RLS, entitlements, permissões, tickets,
    oportunidades, clientes, orçamentos, agenda, temas e autenticação
    existentes.
-   Não criar sistemas paralelos.
-   Preservar migrations **001--039 byte a byte**. Se necessário, criar
    somente **040 incremental**, transacional e compatível com banco
    populado.
-   Sem reset, deploy, produção, provider de cobrança real ou
    armazenamento de cartão.
-   Não inventar pagamento, assinatura, receita, usuário, empresa ou
    membership para contornar autorização.
-   Não enfraquecer RLS/FORCE RLS, isolamento, auditoria, revogação ou
    autorização server-side.
-   Não hardcodar MS Auto Details, pessoas ou nomes de planos.
-   Não alterar preços/nomes comerciais cadastrados pelo proprietário.
-   A bateria mestre da plataforma inteira será feita somente depois da
    homologação manual. Nesta rodada: testes focados + regressão
    necessária.

# 1. Trial self-service --- elegibilidade automática

Fluxo desejado:

**Escolher plano → confirmar dados → verificar elegibilidade
automaticamente → resultado imediato**

Aplicar a empresa nova e empresa existente.

-   Elegível → ativar os **7 dias grátis** configurados.
-   Trial já utilizado/não elegível → não conceder outro; permitir
    contratação normal quando aplicável.
-   Caso realmente inconclusivo → análise administrativa.
-   Trocar e-mail, username ou recriar contexto equivalente não reinicia
    trial.
-   Preservar antifraude/histórico.
-   Super Admin continua podendo conceder/estender trial manualmente.
-   Não integrar provider nesta rodada.
-   Frontend/checkout nunca declara sozinho elegibilidade ou pagamento.

# 2. Comunicação dos 7 dias

Nos cards: **7 dias grátis**.

Condições ficam em texto secundário/contratação. Revisar mensagens
temporárias como "Nenhum meio de pagamento real é necessário" para não
virarem promessa comercial futura. Não mudar os 7 dias definidos pelo
proprietário.

# 3. Plano de homologação aplicado a empresa existente

Substituir a ideia anterior de o Super Admin "fingir ser empresa".

O Super Admin deve poder aplicar temporariamente uma **versão real de
plano** a qualquer empresa cadastrada.

Exemplo:

**Super Admin → MS Auto Details → Aplicar plano para homologação →
Essencial**

Depois o proprietário entra com o **ADM real da empresa** e testa a
experiência real.

Adicionar: - Aplicar plano para homologação; - selecionar empresa; -
selecionar versão real; - ver plano/versão aplicada; - trocar plano; -
encerrar homologação.

Exibir na Administração:

**PLANO APLICADO PARA HOMOLOGAÇÃO --- não representa assinatura ou
pagamento.**

Regras: - sem cartão, checkout, consumo de trial, pagamento, receita ou
conversão; - sem `paid` falso; - sem alterar contrato/assinatura real; -
auditado; - ao encerrar, restaurar a situação comercial legítima
anterior; - não apagar dados operacionais produzidos durante o teste; -
usar os entitlements reais da versão escolhida.

# 4. Homologação real dos planos

Validar a configuração real, sem hardcode.

  Recurso                               Essencial   Profissional   Equipe   Assistido SYZIA
  ----------------------------------- ----------- -------------- -------- -----------------
  Operação básica                             Sim            Sim      Sim               Sim
  Página/Clientes/Orçamentos/Agenda           Sim            Sim      Sim               Sim
  Financeiro                                  Não            Sim      Sim               Sim
  Métricas                                    Não            Sim      Sim               Sim
  Follow-up                                   Não            Sim      Sim               Sim
  Membros próprios                              1              3        8   conforme versão
  Atendimento compartilhado SYZIA             Não            Não      Não               Sim

A tabela descreve a configuração comercial atual, mas o código deve ler
a **versão real do plano**.

Para cada capacidade testar: 1. UI/menu/aba/CTA; 2. rota direta; 3.
RPC/API; 4. banco/RLS.

Plano sem recurso não pode ser contornado por URL, aba já aberta ou
chamada direta.

# 5. Upgrade/downgrade

-   Essencial → Profissional: liberar recursos e preservar dados.
-   Profissional → Essencial: bloquear recursos retirados, inclusive
    rota/RPC/sessão já aberta, sem apagar histórico.
-   Equipe → Assistido: não transformar funcionários próprios em Equipe
    SYZIA.
-   Assistido → plano sem `human_support`: impedir novas operações
    compartilhadas, aplicar regra de suspensão/revogação e preservar
    histórico.

# 6. Plano × papel × permissão × escopo × estado

Preservar:

**acesso efetivo = capacidade do plano + papel permitido + permissão
concedida + escopo autorizado + estado válido**

Testar ADM, colaborador, atendente próprio, atendente compartilhado,
usuário suspenso e vínculo revogado durante sessão.

# 7. Cards de planos --- hover/focus

-   leve elevação;
-   borda/destaque SYZIA;
-   sombra/superfície sutil;
-   CTA ganha presença;
-   transição curta;
-   sem deslocar outros cards;
-   focus equivalente;
-   `prefers-reduced-motion`;
-   mobile sem depender de hover.

# 8. Plano em destaque

Na configuração: **Destacar este plano na comparação**.

Permitir selo configurável, ex.: **Mais recomendado**.

-   somente um plano público destacado por vez;
-   confirmar/substituir destaque anterior;
-   efeito somente comercial/visual;
-   não alterar preço, recursos, limites, entitlement, versão ou
    assinaturas;
-   não hardcodar plano recomendado.

# 9. Cliente após solicitação

Após envio válido: - criar/vincular imediatamente o cliente à
organização; - cliente aparece em **Clientes** conforme autorização; -
não depender de assumir ticket, orçamento, agenda ou conversão; -
recorrência não duplica indevidamente; - falta de `clients.read` deve
aparecer como falta de permissão, não como "0 clientes".

# 10. Fluxo operacional oficial

Preservar Comercial e Atendimento como visões conectadas:

**solicitação → cliente → oportunidade → ticket/Fila geral → atendente
assume → revisa → conversa/ajusta → proposta → cliente aprova/recusa →
agenda quando aplicável → execução/resultado**

Não exigir "resolver Comercial" para chegar ao Atendimento. Não duplicar
sistemas.

# 11. Fila geral × Minha fila

-   nova solicitação entra na Fila geral;
-   inicialmente pode ficar Sem responsável;
-   não entra em Minha fila antes da atribuição;
-   Assumir atendimento valida autorização e atribui;
-   depois aparece em Minha fila;
-   preservar responsabilidade única;
-   impedir dupla assunção;
-   transferência atualiza responsável corretamente.

# 12. Colaborador × atendente próprio

Em **Pessoas e acessos**, deixar explícito: - papel/base; - permissões
efetivas; - se pode atender clientes; - se é atendente próprio; -
escopo.

Mostrar algo equivalente a:

**Atendimento ao cliente: Permitido / Não permitido**

Colaborador não ganha atendimento automaticamente só pelo papel. ADM
concede permissões dentro do teto. Atendente próprio não ganha
administração ou métricas automaticamente. Revogação deve valer
imediatamente.

# 13. "Ação não autorizada" ao assumir atendimento

Diagnosticar papel, grants, vínculo, escopo, plano, estado da empresa,
usuário e ticket.

-   se autorizado, **Assumir atendimento** funciona;
-   se não autorizado, backend recusa;
-   mensagem explica causa real;
-   exemplo: **Você não possui permissão para assumir atendimentos desta
    empresa.**
-   orientar que ADM pode autorizar quando aplicável;
-   não mostrar CTA executável quando a falta de permissão já é
    conhecida;
-   proteção server-side permanece obrigatória.

# 14. Pedido multissserviço na Central

Uma solicitação com vários serviços deve mostrar: - quantidade; - todos
os serviços; - adicionais por item; - respostas; - observações; -
imagens; - modalidade de preço; - alertas `já incluído`, `incompatível`,
`requer revisão`.

Preservar: 1. pedido original; 2. revisão; 3. proposta final; 4. versão
aprovada.

Não apagar pedido original ao ajustar proposta.

# 15. Orçamento/proposta

**solicitação → revisão → proposta → envio → aguardando cliente →
aprovação/recusa**

-   solicitação não vira falsamente orçamento final;
-   proposta enviada aparece em Orçamentos;
-   Comercial avança;
-   consumidor vê a versão exata;
-   alteração cria nova versão;
-   histórico preservado;
-   aprovação/recusa usa versão correta;
-   idempotência preservada.

# 16. Agenda no acompanhamento

Problema: `Consultar horários` pode aparentar consulta e terminar sem
resposta.

Quando ainda depende de proposta: - mostrar **Agendamento disponível
após aprovação da proposta**; - ocultar/desabilitar data/consulta; -
explicar o motivo.

Quando apto: - liberar data e consulta; - com horários → mostrar
opções; - sem horários → **Não há horários disponíveis nesta data.
Escolha outro dia.** - erro técnico → mensagem de falha; - nunca
terminar silenciosamente; - multisserviço considera regras/duração da
proposta final aprovada.

# 17. Sincronização dos módulos

Sincronizar sem duplicar: - Clientes; - Comercial; - Atendimento; -
Orçamentos; - Agenda; - Pendências; - Follow-up; - timeline/histórico.

Eventos reais devem atualizar as visões correspondentes.

# 18. Separar atendimento, venda, execução e pagamento

-   resolver ticket ≠ venda convertida;
-   aprovar proposta ≠ pagamento;
-   agendar ≠ pagamento;
-   serviço realizado é fato próprio;
-   recebimento é fato financeiro próprio;
-   nunca inventar receita.

# 19. Administração global --- Equipe SYZIA

O Super Admin precisa administrar a própria equipe da plataforma.

Criar/evoluir **Administração SYZIA → Equipe SYZIA** para: - listar
integrantes; - ver status; - criar/provisionar; - ver estado de primeiro
acesso; - gerar/reemitir primeiro acesso conforme arquitetura
existente; - redefinir acesso quando aplicável; - encerrar sessões
administrativamente; - suspender/desativar/reativar; - ver empresas
atribuídas; - atribuir/remover atendente compartilhado de empresa
elegível; - auditar ações.

Gerenciar Equipe SYZIA não concede automaticamente ao Super Admin acesso
aos clientes, conversas ou métricas privadas das empresas.

# 20. Ciclo de vida do colaborador SYZIA

Usuário criado pelo Super Admin para trabalhar na operação SYZIA
pertence à **SYZIA**, não à empresa cliente.

Somente Super Admin pode: - criar/provisionar; - gerar/reemitir código
de primeiro acesso; - redefinir acesso; - encerrar sessões
administrativamente; - editar acesso global; -
suspender/desativar/reativar; - administrar identidade global; -
atribuir/remover empresas atendidas.

Uma pessoa da Equipe SYZIA pode atender várias empresas autorizadas.

Remover da Empresa A não remove sua conta SYZIA nem vínculos com B/C.
Suspensão global impede novas operações em todas as empresas após
revalidação.

# 21. Autoridade do ADM sobre atendente SYZIA

ADM da empresa **não pode**: - gerar código do atendente SYZIA; -
redefinir senha/acesso global; - desativar conta SYZIA; - editar
identidade global; - atribuir a outras empresas.

Após atribuição feita pela SYZIA, ADM configura somente a
**autonomia/permissões locais** daquela pessoa na sua empresa, dentro do
teto permitido.

Separar visualmente:

**Empresa → Pessoas e acessos** - administradores; - colaboradores
próprios; - atendentes próprios; - atendentes SYZIA atribuídos, com
autonomia local.

**Administração SYZIA → Equipe SYZIA** - integrantes da plataforma; -
status; - segurança/primeiro acesso; - empresas atribuídas; -
distribuição operacional.

Não tratar "colaborador da empresa" e "colaborador da SYZIA" como a
mesma coisa.

# 22. Acompanhamento do consumidor com identidade da empresa

A experiência:

**página pública → pedido → acompanhamento → conversa → proposta →
aprovação → agenda**

deve parecer uma jornada contínua da empresa.

Reutilizar a **identidade publicada**: - logo; - tema claro/escuro; -
cor principal e tokens derivados; - CTAs, links e badges; - cards,
inputs e modais; - focus; - alertas/erros/sucesso; - superfícies; -
responsividade.

Regras: - usar identidade publicada, não rascunho; - não copiar CSS
manualmente por empresa; - reutilizar tema/tokens existentes; - evitar
resíduos visuais SYZIA quando não representam a plataforma; - garantir
contraste/acessibilidade; - preservar segurança/token/link; - não expor
dados adicionais; - **Meus pedidos** também respeita a identidade quando
acessado no contexto da empresa.

# 23. FAQ + Planeje seu atendimento

Na página pública: - card **Planeje seu atendimento** com altura do
próprio conteúdo; - não esticar pela altura do FAQ; - alinhar pelo
topo; - melhorar espaçamento/legibilidade; - hover/focus discreto nas
perguntas; - `+` muda de estado ao abrir; - melhorar **Preciso de
ajuda**; - mobile: FAQ → horários → ajuda; - não alterar conteúdo,
horários ou regras.

# 24. Manual --- labels em português

Não exibir chaves técnicas como:

`business`, `cancellation`, `deadlines`, `exceptions`, `important`,
`objections`, `operation`, `payments`, `policies`, `regions`,
`rescheduling`.

Apresentação: - business → **Empresa e atendimento** - cancellation →
**Cancelamentos** - deadlines → **Prazos** - exceptions → **Exceções** -
important → **Informações importantes** - objections → **Dúvidas e
objeções** - operation → **Operação** - payments → **Pagamentos** -
policies → **Políticas** - regions → **Regiões de atendimento** -
rescheduling → **Remarcações**

Manter chaves internas se necessárias ao banco/API. Traduzir somente
apresentação. Busca continua funcionando.

Fazer varredura focada por outras strings técnicas/inglesas expostas ao
usuário em Atendimento, Comercial, Pendências e módulos relacionados.
Não fazer substituição cega no banco.

# 25. Testes obrigatórios desta rodada

Executar testes focados + regressão necessária, sem chamar isso de
auditoria final.

Cobrir pelo menos: 1. trial elegível automático; 2. trial já usado; 3.
fallback de análise; 4. aplicar/trocar/remover plano de homologação; 5.
homologação não gerar pagamento/trial/receita; 6.
Essencial/Profissional/Equipe/Assistido por UI, rota, RPC e RLS; 7.
upgrade/downgrade com sessão aberta; 8. plano × papel × grant × escopo;
9. plano destacado; 10. cliente após solicitação; 11. Fila geral →
assumir → Minha fila; 12. colaborador autorizado e não autorizado; 13.
atendente próprio; 14. pedido de 1 serviço; 15. pedido multissserviço;
16. preço fixo; 17. preço "a partir de"; 18. sob consulta; 19. proposta
→ aprovação/recusa; 20. agenda bloqueada antes da proposta; 21. agenda
liberada depois; 22. dia sem horários; 23. erro de consulta; 24.
remarcação/cancelamento; 25. Equipe SYZIA administrada pelo Super Admin;
26. ADM sem poder sobre credencial global da Equipe SYZIA; 27.
atribuição compartilhada somente com `human_support`; 28. retirada de
`human_support` durante sessão; 29. acompanhamento com identidade
publicada em claro/escuro; 30. labels do Manual em português; 31.
isolamento A/B; 32. revogação durante sessão; 33. build/typecheck; 34.
upgrade 039→040 em banco populado se houver migration.

# 26. O que não é bug / não corrigir

Não alterar por engano: - página pública indisponível quando a empresa
realmente não possui vigência/isenção válida; - bloqueio de ação quando
usuário realmente não possui permissão; - Orçamentos zerado antes de
existir proposta; - Agenda zerada antes de existir agendamento; - Minha
fila vazia antes de alguém assumir o ticket.

Corrigir a UX quando esses estados não forem explicados adequadamente.

# 27. Entrega

Entregar: - projeto consolidado completo; - migration 040 somente se
necessária; - guia de upgrade sem reset; - relatório técnico; -
inventário de arquivos alterados; - matriz dos planos/capabilities
testados; - matriz dos papéis/permissões afetados; - resultados dos
testes focados e regressão; - pendências externas claramente separadas.

No relatório distinguir: - **CORRIGIDO NESTA RODADA**; - **TESTADO
LOCALMENTE**; - **PENDENTE DE HOMOLOGAÇÃO EXTERNA**; - **DECISÃO DE
PRODUTO PENDENTE**, quando realmente existir.

Não alegar homologação real de cobrança/provider porque não existe
provider configurado.

# 28. Encerramento

Depois de implementar, testar, documentar e entregar o consolidado:

**PARAR.**

Não iniciar nova rodada, deploy, produção, cobrança real ou auditoria
mestre automaticamente.

A próxima etapa será nova homologação manual do proprietário. Somente
depois de tudo estar alinhado será solicitada uma bateria ampla de
testes da plataforma inteira, principalmente nos cenários que o
proprietário não consegue validar manualmente.
