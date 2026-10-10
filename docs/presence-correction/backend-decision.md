# Necessidade da migration 031

Inspeção do consolidado 030, sem alterações nas migrations já aplicadas:

- A constraint `company_branding_primary_color_check` aceita somente cinco cores. É necessário aceitar HEX validado para persistir a escolha visual personalizada.
- `services.image_url` só aceita URL HTTPS externa. O banco de imagens `company_media` e o gateway já existem, mas o acesso público só aceita logo, capa e imagens de portfólio de uma publicação ativa. É necessário vincular a imagem do serviço à mídia da própria empresa e incluí-la no snapshot publicado e na autorização do gateway.
- A publicação existente exige um `manual_id` aprovado, e a seleção do consumidor lê esse snapshot. Publicar um novo manual altera a autorização operacional do atendimento. A correção deve permitir aprovar exclusivamente o conteúdo público, sem alterar regras/autonomias do atendimento. A mesma tabela imutável `consumer_publications` passa a aceitar uma publicação de conteúdo público sem manual; a seleção usa o catálogo público congelado dessa versão. Publicações antigas continuam referindo seus manuais sem qualquer regravação.
- Não existe RPC para excluir trabalho. A exclusão remove somente o rascunho; snapshots e imagens publicados permanecem preservados até nova publicação.

Reutilização: categorias e suas RPCs, company_save, company_media/Storage/sanitização, branding, portfolio_items, consumer_pages/publications, permissões 030, auditoria e onboarding existentes. Foto única usa a galeria existente com uma imagem. Não há nova tabela de categorias, imagens, portfólio ou páginas, nem alteração em RLS, autenticação, financeiro, métricas, trial ou billing.

O novo fluxo de publicação é explícito: salvar rascunhos → visualizar como cliente → publicar. A prévia é autenticada, usa somente campos públicos, não grava nem fica acessível por link anônimo. O hash da revisão impede publicar conteúdo diferente do revisado. Foram testadas publicação antiga/nova, solicitação com adicionais/respostas obrigatórias e isolamento A/B, por serem os pontos sensíveis diretamente afetados.

Durante a validação, a autorização granular 030 chegou corretamente ao upload, mas a chamada interna ainda exigia o antigo lock exclusivo de ADM. A 031 ajusta somente os aliases de salvar serviço, identidade, portfólio e reservar mídia para exigir as permissões existentes e manter lock/revisão. O helper compartilhado `company_lock`, os papéis, as concessões existentes e as políticas RLS continuam intactos. O gateway mantém a sessão verificada; o editor de serviços lê sua própria mídia ou mídia vinculada a serviço autorizado.

O checklist existente passa a reconhecer a mesma publicação de conteúdo público; o progresso do tutorial e os requisitos do atendimento humano permanecem preservados.
