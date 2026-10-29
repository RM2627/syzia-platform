# Aquisição pelo Insights

Cada artigo pode conter CTAs com texto e destino próprios. Priorize uma funcionalidade relacionada ao assunto. Os rascunhos usam `/contato`, rota já existente; não inventam URLs de demonstrações publicadas. Quando houver uma demonstração revisada, pública e disponível, use o link gerado pela gestão comercial existente. Confira validade, estado e isolamento com visitante sem privilégios antes de publicá-lo. Não use convite de ativação ou link de edição como CTA público.

Guias e materiais são formatos editoriais navegáveis (`?kind=guide` e `?kind=material`); não foi criado comércio ou download pago. Categorias vazias ficam ocultas. O espaço para monetização está reservado em `server/insights/monetization.mjs`, desativado: nenhum anúncio, pixel, afiliado ou cobrança é disparado.

O formulário opcional coleta nome, e-mail, segmento e necessidade. Exige solicitação de contato, possui honeypot, limite de frequência e validação no banco. E-mail é deduplicado no cadastro de aquisição já existente. Registra origem do artigo/categoria/CTA, data, UTMs permitidas e versão da informação de contato. Não inventa WhatsApp, interesse em contratação, autorização genérica para campanhas ou aceite contratual. Nenhum e-mail é enviado automaticamente.

A primeira atribuição editorial do lead é preservada. Novos envios não sobrescrevem silenciosamente o cadastro/histórico existente. Consultar e atender os interessados na área de aquisição já autorizada da SYZIA. Remoção/descadastramento segue os procedimentos de dados existentes; a 061 não redefine consentimentos anteriores.

Cliques em CTA indicam intenção de navegação. A 061 não afirma acesso efetivo à demo, interesse confirmado nem conversão paga a partir desses cliques. A integração de atribuição de contratação entre origens dependerá de eventos verificáveis e revisão adicional, sem rastreamento oculto. O relatório distingue essa limitação.

Pré-publicação: revisar política pública aplicável ao formulário/medição com o proprietário; conferir os destinos; testar a demo existente em ambiente autorizado; configurar sitemap no Search Console apenas com autorização. Nada disso foi executado em produção nesta rodada.
