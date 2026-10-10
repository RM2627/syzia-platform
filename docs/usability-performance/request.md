# SYZIA --- AUDITORIA FINAL DE USABILIDADE E DESEMPENHO PERCEBIDO

## Refinamento pré-lançamento

> **LEIA TODO ESTE DOCUMENTO ANTES DE ALTERAR QUALQUER ARQUIVO.**

Base: **última versão consolidada e aprovada da SYZIA disponível neste
Work**.

Esta NÃO é nova auditoria funcional completa. Não repetir auditorias
anteriores de regras, RLS, planos, propostas, agenda ou segurança sem
necessidade.

# 0. OBJETIVO

Fazer a SYZIA parecer tão bem acabada, rápida e coerente quanto já está
funcionalmente.

Auditar: - usabilidade; - desempenho percebido; - carregamentos; -
requests/RPCs redundantes; - transições; - re-renderizações; -
estabilidade visual; - responsividade; - feedback; - clareza de
navegação.

# 1. CASO REAL PRIORITÁRIO --- LOADING DUPLO AO ABRIR EMPRESA

Fluxo observado:

**Minhas empresas → Abrir empresa → loading → aparentemente termina →
outro loading → Home final**

Investigar: - shell + empresa carregando em etapas desnecessárias; -
redirect intermediário; - fetch/RPC duplicada; - contexto inicializado
duas vezes; - refetch imediato; - remount; - effects/dependências; -
autenticação/contexto sequenciais; - loader global substituindo conteúdo
já resolvido; - diferença entre StrictMode e produção.

Resultado desejado:

**Abrir empresa → um loading/skeleton coerente → Home**

ou:

**Abrir empresa → estrutura/Home → blocos secundários carregam
localmente**

Nunca `loader → tela → loader → tela final` sem necessidade.

# 2. NÃO TRANSFORMAR EM NOVO DESENVOLVIMENTO

Não adicionar módulos/funcionalidades, mudar regras, planos, preços,
permissões, RLS, jornada comercial, estados, orçamento, Agenda ou
cobrança. Sem deploy/publicação.

# 3. O QUE PODE CORRIGIR DIRETAMENTE

Somente problemas claros e de baixo risco: - loading/fetch/RPC
duplicados; - refetch/remount/re-render desnecessários; - loader global
excessivo; - skeleton incoerente; - flicker/layout shift; -
cache/reutilização segura; - consultas independentes sequenciais; - lazy
loading/code splitting de baixo risco e benefício comprovado; - imagens
pesadas; - feedback atrasado; - botão sem processamento; -
scroll/overflow; - responsividade claramente quebrada; - conteúdo
recarregando desnecessariamente ao voltar.

Preservar autorização e atualização correta.

# 4. MUDANÇAS QUE EXIGEM APROVAÇÃO

Se exigir mudar fluxo, etapa, navegação estrutural, regra, permissão,
papel, capability, estado, orçamento, Agenda, Comercial ou informação
importante do consumidor:

**NÃO implementar.**

Registrar `UX-### — AGUARDANDO_APROVACAO` com problema, impacto,
evidência, proposta, risco e telas.

# 5. MEDIR ANTES E DEPOIS

Quando possível registrar por fluxo: - loaders; - requests/RPCs; -
duplicações; - chamadas sequenciais; - tempo aproximado até estrutura
visível; - tempo até conteúdo útil/final; - remount/refetch; -
flicker/layout shift.

Não inventar precisão.

Para cada correção relevante documentar **Antes × Depois**.

# 6. FLUXOS PRIORITÁRIOS

Auditar: 1. Login → empresa → Home. 2. Minhas empresas → Abrir empresa.
3. Trocar empresa. 4. Home → Agenda. 5. Home → Precisa da sua atenção.
6. Home → Atendimento. 7. Home → Cliente. 8. Agenda e troca de
data/visualização. 9. Consultar disponibilidade. 10. Abrir/trocar
tickets. 11. Assumir atendimento. 12. Enviar mensagem. 13. Abrir
cliente/histórico. 14. Comercial/oportunidade. 15. Abrir/montar
proposta. 16. Visualizar como cliente/enviar proposta. 17.
Acompanhamento do consumidor. 18. Aprovar proposta. 19. Consultar
horários. 20. Pessoas e acessos. 21. Serviços. 22. Página pública →
serviço → solicitação. 23. Métricas. 24. Financeiro. 25.
Plano/assinatura. 26. Configurações. 27. Manual/FAQ/respostas/regras.
28. Voltar após edição. 29. Mobile consumidor. 30. Mobile empresarial.

# 7. LOADERS

Procurar loader global seguido de outro, skeleton+spinner redundante,
conteúdo que aparece e some, página inteira carregando por ação local,
loader que pisca, mesma dependência com múltiplos loaders.

Preferir transição única, skeleton estável, loading localizado e
preservação de conteúdo válido.

# 8. REQUESTS / RPCs

Inspecionar: - mesma RPC repetida; - request duplicada na montagem; -
refetch sem mudança; - múltiplos componentes buscando o mesmo
contexto; - dados da empresa recarregados em cada seção; - contexto
disponível ignorado; - independentes feitas em série; -
polling/invalidação excessivos.

Cache deve ser seguro e corretamente chaveado por
empresa/usuário/papel/grants/plano/sessão. Nunca reutilizar A em B.

# 9. TROCA DE EMPRESA

Não mostrar/piscar dados anteriores, não usar cache errado, não
reinicializar tudo sem necessidade, não executar dois loaders globais.
Fluidez nunca compromete isolamento.

# 10. HOME

Verificar carga independente dos blocos, falha isolada, retry, layout
shift, Agenda hoje, próximo atendimento, atenção, amanhã e ações
rápidas. Um bloco carregando não deve bloquear toda a Home se os demais
estão prontos.

# 11. CENTRAL

Avaliar abertura da fila/ticket, troca de ticket, contexto, mensagens,
fotos, cliente, proposta, Agenda, notas e Manual/FAQ. Evitar refetch
completo ao enviar mensagem se atualização localizada for suficiente e
consistente.

# 12. AGENDA

Avaliar primeira abertura, mudança de data, consulta de horários,
visualização, remarcação, bloqueios e múltiplos períodos. Não cachear
disponibilidade de modo a permitir horário obsoleto; revalidação
server-side permanece.

# 13. PÁGINA PÚBLICA / CONSUMIDOR

Especialmente mobile: primeira renderização, logo/capa, imagens,
portfólio, serviços, FAQ, formulário, horários, acompanhamento, proposta
e conversa.

Verificar dimensões, compressão e lazy loading de mídia quando
apropriado.

# 14. BUNDLE

Inspecionar módulos grandes no primeiro acesso, áreas administrativas
carregadas para consumidor, componentes pesados, dependências/assets
desnecessários.

Aplicar lazy/code splitting somente com baixo risco e benefício real.

# 15. FEEDBACK DAS AÇÕES

Auditar Salvar, Enviar, Aprovar, Recusar, Agendar, Remarcar, Cancelar,
Assumir, Transferir, Publicar, Criar e Editar.

Deve haver resposta imediata, prevenção de clique duplo, loading,
sucesso/erro coerentes e idempotência.

# 16. NAVEGAÇÃO / USABILIDADE

Avaliar localização do usuário, títulos, voltar, CTA principal, ações
escondidas, duplicações, menus redundantes, rotas inesperadas, cliques
desnecessários e estados vazios.

Mudança estrutural = `UX-###`.

# 17. FORMULÁRIOS

Auditar foco, validação, erros, salvar, perda de dados, clique duplo,
botão bloqueado sem motivo, obrigatórios, teclado mobile e scroll para
erro. Não mudar regra de negócio.

# 18. ESTABILIDADE VISUAL

Procurar layout shift, cards mudando de tamanho, scrollbar/header
pulando, imagens deslocando conteúdo, modal saltando, tabela/overflow,
texto cortado, drawer fora da viewport e skeleton com dimensões erradas.

# 19. MOBILE

Testar página pública, solicitação, acompanhamento, proposta, Agenda
consumidor, Home, Central, Agenda, Clientes e orçamento.

Verificar tap targets, teclado, campos, modais/drawers, tabelas, menus,
overflow, botões fixos e legibilidade.

# 20. TEMA

Sem flash indevido, loaders/skeletons/modais respeitam tema, contraste
básico e troca de tema não dispara refetch sem necessidade.

# 21. ERROS

Diferenciar rede, autorização, indisponibilidade, validação, conflito e
não encontrado quando possível. Não mostrar "verifique a conexão" para
qualquer erro nem expor erro técnico cru.

# 22. DESEMPENHO PERCEBIDO

Mesmo sem reduzir tempo absoluto, melhorar quando seguro por estrutura
antecipada, conteúdo preservado, loading localizado, feedback imediato e
ausência de flicker. Não esconder estado incorreto.

# 23. DADOS REALISTAS

Usar fixtures sintéticas suficientes para listas de clientes, tickets,
oportunidades, Agenda, portfólio, serviços e mensagens. Sem dados reais
e sem benchmark destrutivo.

# 24. REGRESSÃO

Após otimizações de baixo risco, executar o **gate cumulativo vigente**
e reexecutar fluxos afetados.

Se otimização causar regressão e a solução exigir mudança funcional,
reverter e registrar `UX-###`.

# 25. RELATÓRIO

Criar `RELATORIO-USABILIDADE-DESEMPENHO.md` com: - corrigidos
automaticamente; - `UX-###` aguardando aprovação; - medições
antes/depois; - limitações; - pendências externas.

Criar matriz com fluxo, dispositivo, loaders antes/depois, requests
antes/depois, duplicações, comportamento e evidência.

# 26. CLASSIFICAÇÃO UX

-   **UX-ALTO**: fricção que pode impedir/prejudicar fluxo importante.
-   **UX-MÉDIO**: funciona, mas é confuso/lento/repetitivo.
-   **UX-BAIXO**: acabamento.

Severidade não autoriza mudança estrutural.

# 27. CRITÉRIO DE CONCLUSÃO

Encerrar quando: - Abrir empresa não tiver loading duplo
desnecessário; - não houver duplicações óbvias nos fluxos
prioritários; - loaders globais estiverem restritos; - ações importantes
responderem imediatamente; - flickers/layout shifts relevantes
conhecidos forem tratados; - principais telas mobile estiverem
utilizáveis; - gate cumulativo PASS; - autorização/isolamento
preservados; - sugestões estruturais estiverem documentadas.

Não declarar "performance perfeita".

# 28. ENTREGÁVEIS

Entregar: 1. projeto consolidado apenas com otimizações de baixo risco;
2. `RELATORIO-USABILIDADE-DESEMPENHO.md`; 3. matriz antes/depois; 4.
lista `UX-###`; 5. inventário de arquivos alterados; 6. evidências; 7.
resultado do gate cumulativo; 8. limitações/pendências; 9. guia de
atualização se necessário.

**Se não houver mudança persistente de banco, não criar migration apenas
pelo número da rodada.**

# 29. PARADA

Depois de otimizar, testar e entregar:

> **PARAR.**

Não implementar `UX-###` pendentes, não criar funcionalidade, não fazer
deploy/publicação e não iniciar nova rodada.
