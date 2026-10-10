# Integração e mapa operacional do produto

Auditoria local, sem deploy. As áreas continuam na arquitetura existente; planos/billing são módulo separado e carregado sob demanda. Não há Fase 9.

| Área | Entrada | Integração |
|---|---|---|
| Autenticação | /entrar, /recuperar-acesso, /atualizar-senha | Auth real preparado; demo explicitamente simulada |
| Empresas da conta | / | Vínculos atuais; menu com todas as áreas autorizadas |
| Empresa | /painel/:orgId | Membros, cadastro e links de operação |
| Onboarding/configuração/manual | /painel/:orgId/configuracao | Serviços, adicionais, perguntas, regras, autonomia, prontidão e publicação |
| Consumidor/configuração | /painel/:orgId/consumidor | Presença, portfólio, políticas, agenda e preparação de pagamento |
| Página pública | /empresa/:slug | Conteúdo publicado, serviço, imagens, orçamento/agenda/ajuda |
| Solicitações e acompanhamento | /minhas-solicitacoes, /acompanhar/:code | Sessão/acesso restrito, proposta, aprovação, agenda e conversa |
| Atendimento humano | /central, /central/:code | Contexto de cliente, manual, mensagens, notas, orçamento, agenda e pendências |
| Pendências da empresa | /painel/:orgId/pendencias | Decisões autorizadas ligadas ao ticket |
| Comercial | /comercial, /comercial/:code, /painel/:orgId/comercial | Oportunidades, tentativas, retorno, perda, conversão |
| Analytics | /painel/:orgId/metricas, /painel/:orgId/operacao | Empresa e operação com escopos distintos |
| Assinatura | /painel/:orgId/assinatura | Plano, recursos, limites, uso, histórico e ações |
| Administração | /admin/empresas, /admin/equipe, /admin/auditoria | Fundação preservada, sem criar acesso novo a conteúdo privado |
| Administração analítica | /admin/metricas | Capacidade, sem receita presumida |
| Administração de assinatura | /admin/assinaturas | Ofertas/versionamento, situações, uso e simulação restrita |

Clientes, propostas e agenda são acessíveis pelo contexto operacional/consumidor correspondente; não foi criado um CRM ou ERP paralelo. A URL de FAQ existente continua disponível. Navegação móvel usa menu explícito e foco visível. Página pública carrega seu módulo sem baixar FoundationApp/Central/Comercial/Analytics/Admin/Billing; teste de rede confirma em desenvolvimento e build separa os chunks.

Correções da revisão: fotografia de serviço antes recebida e ignorada agora exibida; portfólio ampliável com foco/teclado/touch; menu móvel antes cortado; retorno de foco do dialog; sessões anônimas descartáveis individualizadas na demo; e-mail desconhecido não dá fallback de admin; identidade de conta e escopo mantidos na troca de tela.

Não encontrados TODO/FIXME críticos no código de interface. Placeholders de campos são dicas, não funcionalidades ausentes. Mocks ficam nos testes/demo e provider fictício explicitamente desabilitado por padrão no banco. Não há service role no bundle. A revisão local não substitui auditoria independente de segurança, dispositivos físicos, acessibilidade completa ou performance externa.
