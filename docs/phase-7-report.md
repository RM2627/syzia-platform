# Relatório de desenvolvimento — Fase 7

Entrega cumulativa das Fases 2–7, em 17/09/2026. **DESENVOLVIMENTO LOCAL concluído. HOMOLOGAÇÃO EXTERNA PENDENTE e não executada.** Não houve deploy, acesso a banco real da MS Auto Details, contratação de serviços, clientes reais ou início da Fase 8. Esta entrega depende da revisão de Marcelo para continuidade.

## Implementação

Três visões de métricas calculadas no banco, sobre eventos e registros existentes:

- Empresa: solicitações, oportunidades, propostas finais, aprovações, agendamentos, conversões, perdas/encerramentos, taxa, origens, serviços, série diária, tarefas, tentativas e conversões após tentativa.
- Operação humana: atendimentos, resoluções, primeira resposta média/mediana, sem resposta, referência atual de SLA e fila atual separada. Sem ranking, monitoramento de teclado/mouse, câmera ou avaliação individual.
- Plataforma: empresas, perfis e volume de solicitações/atendimentos/reservas; somente superadmin ativo. Não há planos, cobrança ou receita implementados nesta fase.

Filtros comerciais por período, serviço e origem; período e organização para atendimento. A API agrega no SQL e limita a resposta, sem carregar clientes/eventos brutos no frontend. Valores orçados e aprovados têm definições próprias; receita retorna null e aparece como indisponível. Etapas são contadas uma vez por oportunidade, com base nos eventos persistidos.

A visão comercial acompanha a coorte de interesses CRIADOS no período, com progresso até seu fim. Não é relatório financeiro de lançamentos ocorridos no período. Encerramentos e conversões podem coexistir após reabertura; etapas podem ser puladas por agendamento direto. Dicionário completo: `phase-7-metrics.md`.

## SQL e segurança

Nova migration: **202609170017_analytics.sql**, após as 16 anteriores. Adiciona `public.analytics_company`, `public.analytics_central`, `public.analytics_platform`, helper `private.analytics_period` e cinco índices. Nenhuma nova tabela, policy, constraint, trigger ou papel; permanecem **55 tabelas públicas com RLS/FORCE RLS e 55 policies de leitura**.

As RPCs de leitura SECURITY DEFINER têm search_path vazio, autorização atual e predicado explícito de organização. Sem EXECUTE para anon/PUBLIC; helper não executável por clientes. Permissões da Fundação/Empresa/Central são reutilizadas; revogação/suspensão impede a próxima consulta, mesmo com claims locais ainda existentes. Não se concedeu escrita direta para fazer analytics funcionar. Conteúdos privados, contatos, notas, manual e desempenho individual não compõem os agregados.

As migrations 001–016 foram comparadas byte a byte com o pacote completo aprovado da Fase 6, versão 6: todas idênticas. Upgrade 016→017 preservou dados, auditoria e históricos. Inventário exato e evidências: `phase-7-sql-inventory.md`, `reports/phase-7-sql-catalog.json`, `reports/phase-7-migration-integrity.json`.

## Páginas, componentes e experiência

Novas rotas: `/painel/:orgId/metricas`, `/painel/:orgId/operacao`, `/admin/metricas`. Implementação em `src/analytics/Analytics.tsx` e `analytics.css`; primitivas `Metric`, `Skeleton`, `Empty` em `src/ui/Primitives.tsx`; tokens e componentes visuais em `src/ui/design-system.css`. Navegação e links integrados ao painel existente. Atualização manual/60 segundos, tratamento de vazio/erro, limpeza de dados anteriores e proteção contra respostas obsoletas.

Presença pública: hero com logo/capa/descrição, catálogo e ações claras, preços fixos/a partir de/sob consulta, portfólio, informações comerciais, FAQ, horários e ajuda. Reutiliza somente projeções publicadas. Identidades verde e terracota distintas para duas empresas fictícias; assets SVG editáveis em `assets/demo`. Grid, tipografia, cards, controles, abas, sidebar e feedback evoluídos também nas áreas autenticadas. Foco visível, labels, movimento reduzido e dados diários acessíveis em tabela. Não se declara certificação WCAG.

Quinze capturas de referência em `reports/visual-phase7`, com páginas públicas A/B e métricas em desktop/tablet/celular, mais painel, plataforma, Central e Comercial. Responsividade também verificada por automação; inspeção visual identificou e corrigiu herança de navegação lateral no breadcrumb de métricas.

## Demo e falhas corrigidas

1. **Página pública falhava no navegador:** preflight CORS não permitia `content-profile` do cliente Supabase. Incluídos content-profile/accept-profile mantendo origem loopback restrita. Novos testes reais no navegador local, sem interceptação de RPC, cobrem o caminho anteriormente ausente.
2. **Compatibilidade da emulação:** argumentos omitidos preservam defaults SQL; leitura administrativa limitada e parametrizada executa sob RLS do chamador. Superadmin fictício acessa a visão da plataforma.
3. **Dados de demonstração:** serviços selecionados por modalidade, ticket criado antes de seu uso e atendimento reativado após publicação do manual B. Corrigidas fixtures que dependiam de ordem incidental ou estado anterior.
4. **Testes de conversão:** respeitam critério de conversão congelado no interesse; aprovação sozinha não vira conversão quando o critério é agendamento. Reserva elegível é criada pelo fluxo real, sem enfraquecer regras.
5. **Timezone:** tentativa inicial de usar America/New_York foi corretamente recusada pela constraint anterior. Preservado America/Recife; teste confirma rejeição de fuso não permitido e limite diário empresarial.
6. **Usabilidade:** rótulos acessíveis dos filtros, limpeza de conteúdo antigo em erros/troca de empresa, ícone de região, fallback visual genérico para outros segmentos e breadcrumb com contraste/direção próprios.

A demo inclui 24 interesses adicionais aos exemplos anteriores, cinco origens e cenários reais de fluxo usando exclusivamente fixtures. Transições e históricos passam pelas funções existentes; ajustes diretos limitam-se a datas/dados de fixture locais, não a KPIs inventados ou reescrita de eventos imutáveis. Encerrar e reiniciar descarta/recria os dados. Instruções e contas em `phase-7-demo.md`; launchers Windows/Linux incluídos. Nunca publicar o servidor de demo.

## Testes locais e evidências

**431 casos únicos aprovados, zero falhas nas suítes concluídas (391 da base + 40 novos).** PostgreSQL nativo bloqueado permanece pendente, fora da contagem.

Matriz detalhada: `phase-7-test-matrix.md`; resumo verificável: `reports/phase-7-summary.json`. Suítes SQL usam PostgreSQL embutido PGlite com claims Auth simulados; testes de interface da regressão usam transporte controlado; a suíte demo usa HTTP real em loopback, PGlite e Auth/Storage simulados. Nenhum desses níveis equivale a Supabase real.

Cobertura obrigatória inclui isolamento A/B nos agregados, filtros de serviço de outra empresa, anon/consumidor/atendente sem permissão comercial, revogação de vínculo/papel, suspensão, escrita direta proibida, vazio/divisão por zero, período inválido e limite Recife, revisões de propostas, idempotência, conversão/perda, tentativa/recuperação, SLA e ausência de receita presumida. Regressão preserva os testes de segurança e fluxos das Fases 2–6.

Build TypeScript/Vite local e inspeção de bundle sem marcador privilegiado executados. Nenhuma chave real foi inserida. O build emite aviso de chunk principal de aproximadamente 504 kB (144 kB gzip); módulos operacionais têm carregamento separado. Este aviso não é falha de build, nem substitui medição de desempenho em ambiente futuro.

## Limitações e pendências

- **Supabase/Auth/PostgREST/Storage reais, SMTP, JWTs assinados, URLs temporárias, revogação real, performance e backup/restauração: PENDENTE DE HOMOLOGAÇÃO EXTERNA.** Guia específico preparado, não executado, preservando os guias das fases anteriores.
- PostgreSQL nativo com conexões independentes não pôde iniciar neste contêiner por impossibilidade de mapear usuário não-root. Comando encerrou com código 2; **nenhum teste nativo de concorrência foi executado**. Não confundir verificação transacional local PGlite com concorrência real. Scripts permanecem disponíveis.
- Timezone empresarial continua limitado a America/Recife pela constraint original. SLA usa referência atual e segundos corridos, sem reconstituição contratual histórica ou desconto de expediente.
- Nomes/origens são dimensões atuais, não atribuição histórica versionada. Conversão após tentativa é associação temporal, não prova de efeito causal. Não há receita até integração financeira futura autorizada.
- Resposta limita série a 366 dias, grupos a 50 serviços e seletor a 200 serviços; totais preservados. Escala/EXPLAIN/rate limits exigem ambiente dedicado representativo.
- Chromium Linux local validado; Safari/Firefox, aparelhos físicos, testes assistivos completos e launcher Windows em Windows ainda não validados.

## Entrega e encerramento

`Projeto-Fase-7-Analytics.zip` é o projeto completo, não um patch: código e assets, migrations desde 001, SQL/RLS/RPCs, testes, fixtures, scripts, exemplos de configuração, package.json/lockfile, README, AGENTS, relatórios históricos/atuais e evidências. `MANIFEST.json` permite verificar integridade. Dependências reinstaláveis, builds e segredos não são empacotados; reconstrução por `npm ci`, testes e `npm run build`.

**Fase 7 entregue para revisão de desenvolvimento. Não homologada externamente. Não publicada. Fase 8 não iniciada; aguardar aprovação expressa de Marcelo.**
