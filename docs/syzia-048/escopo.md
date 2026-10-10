# Escopo autorizado — SYZIA 048

Base obrigatória: SYZIA-047-BASE-LIMPA-CONSOLIDADA, SHA-256 `4786336ac5f2e998e5510d1a645c818a78bd9a3b4e847abb8ce6f5a1e185d517`.

1. Reutilizar os handlers de Plataforma, Anexos e Billing em um único processo Node.js e uma única porta HTTP `PORT`. Preservar rotas, auth, CORS seguro, multiempresa, uploads/downloads, notificações e reconciliação; preparar startup, shutdown, health e documentação de Render.
2. Manual opcional para publicação e operação da equipe própria, inclusive onboarding, permissões, atendimento, propostas, Comercial e Agenda. A decisão não dispensa dados mínimos, grants, autonomia, capacidades, disponibilidade, integridade ou segurança. Não criar RH ou treinamento.
3. A Equipe SYZIA compartilhada continua exigindo orientação publicada para atuar; sua falta não bloqueia a operação própria. Preservar identidade global, atribuições, disponibilidade flexível/programada, quotas, consumo, auditoria e histórico. Assistido não comercializado.
4. Migration 048 somente incremental/transacional, sem editar 001–047, reset ou SQL no Supabase real. Preservar RLS/FORCE RLS e dados populados.
5. Executar testes focados, npm ci, build/typecheck e gate vigente, inclusive navegador desktop/mobile, sobre uma extração nova da base limpa. Preservar testes e fixtures; excluir apenas saídas reproduzíveis/históricas.
6. Billing 047 permanece: três preços aprovados, trial de sete dias com meio de pagamento, tolerância de três dias e demais políticas. MP-01 continua pendente de homologação externa. UX-001 preservada; UX-002 não reaberta.
7. Entregar consolidado completo, relatório, guias, migration, matriz, inventário, gate e pendências; restabelecer freeze funcional somente após PASS. PARAR sem deploy, publicação, DNS, ativação de Mercado Pago, cobrança real ou próxima rodada.

Os endereços api.usesyzia.com.br, app.usesyzia.com.br e usesyzia.com.br são apenas planejados nesta rodada.
