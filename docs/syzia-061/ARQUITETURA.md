# SYZIA 061 — arquitetura e limites

Base oficial: `6e9cacae053e964b063f0e533e0b752bdddaa869`. Branch local: `syzia-061-integrada`. Sem commit, push, deploy ou acesso a bancos remotos. O escopo integral está em `ESCOPO.md`.

| Elemento existente | Reutilização na 061 |
|---|---|
| Backend unificado e uma porta HTTP | `/blog`, assets, mídia e interações usam `server/unified.mjs`. Nenhum processo extra de produção. |
| Autenticação e sessões | Editor chama RPC com JWT existente; servidor verifica usuário ativo, sessão e autorização editorial explícita. Nenhum login paralelo. |
| Administração | Link e rota `/admin/insights` dentro do workspace; ativação visual por flag. |
| Aquisição | Formulário grava em `private.acquisition_leads`; origens editoriais ficam separadas. Não cria novo CRM, consentimento de campanha ou assinatura. |
| Demonstrações e Studio | Links editoriais podem apontar para demonstrações já publicadas. Nenhum simulador novo ou token administrativo. |
| Serviços, pedidos e agenda | Metadados de quantidade no serviço e na publicação; cálculo na seleção SQL existente; mesmos pedidos, versões de orçamento, confirmação e agenda. |
| Billing | Gateway Mercado Pago, checkout e regras existentes. Novo registro de ofertas por ambiente e novas versões; ofertas e contratos anteriores preservados. |

## A — Insights

HTML público renderizado pelo Node, legível sem JavaScript. O JavaScript acrescenta curtidas, compartilhamento e formulário. Editor React por blocos com prévia privada. Tabelas privadas com RLS/FORCE RLS, acesso somente por funções delimitadas. Conteúdo publicado é snapshot independente do rascunho; alterações concorrentes exigem revisão atual inclusive nas mudanças de estado. Histórico de conteúdo não é substituído.

Publicação agendada: tick no processo Node, a cada minuto, lock de linha/skip locked, versão fixada e auditoria. Falhas ficam registradas e repetem com intervalo crescente até 60 minutos. Instância adormecida não executa jobs; ao despertar processa pendências. Não existe garantia de pontualidade em hospedagem gratuita suspensa.

Cache HTML/API: `no-store`, portanto publicação/despublicação aparece sem invalidação externa. Assets/mídias usam uma hora de cache. Imagens públicas somente quando referenciadas por artigo publicado. Arquivo já baixado/cacheado não pode ser revogado retroativamente. Sitemap é gerado a cada leitura. Rascunhos não entram no catálogo nem no sitemap.

Imagens raster são decodificadas e reencodadas em WebP, sem EXIF, até 1600 px, 400 KB e 16 milhões de pixels de entrada. Limite de entrada 2 MB no editor. Armazenamento bytea privado reutiliza o banco existente: adequado a volume inicial pequeno; monitorar armazenamento/backup antes de expandir. Não foi contratado storage.

Curtidas: identidade autenticada validada quando disponível na mesma origem; visitantes usam cookie assinado de primeira parte. Identificadores são HMAC, não e-mail/IP em texto. Cookie HttpOnly/SameSite; POST exige origem exata. Não há fingerprinting. Limpeza de cookies e outros dispositivos podem contar novamente. Limite HTTP em memória é por instância; banco aplica unicidade/deduplicação. Não é proteção distribuída contra ataques volumétricos.

Medição de leitura é opcional, sem pixels. Eventos repetidos têm janela de 30 minutos; retenção de eventos 90 dias, expurgada pelo job. Curtidas permanecem até descurtir e registros comerciais seguem o fluxo de aquisição existente. Visitantes estimados são identificadores, não pessoas. Compartilhamentos e CTAs representam cliques de intenção. Não há prova de leitura da demo ou de assinatura atribuída; esses números não são inventados.

## B — quantidade

Desligada por padrão, mínimo/máximo entre 1 e 100 (limite já aceito pelo motor de orçamentos). Unidade é rótulo, não variação de serviço. Servidor recalcula preço em centavos a partir do snapshot publicado. Quantidade multiplica o serviço; adicionais mantêm a cobrança uma vez por serviço selecionado. Duração fixa, proporcional apenas ao serviço, ou confirmação manual. Manual impede aceite direto. A agenda usa a duração recalculada e os validadores de capacidade existentes.

A seleção original, a quantidade dos itens do orçamento e a política de duração ficam preservadas. Revisões posteriores usam o mecanismo de orçamento/auditoria existente. Snapshots comerciais antigos com valores padrão mantêm o formato anterior; snapshots novos transportam as configurações habilitadas.

## C — isolamento financeiro

Migração mantém `legacy`. Configuração futura cria novas versões comerciais e ofertas `sandbox` ou `production` sem editar IDs históricos. Cada contrato ganha ambiente imutável e referência ao mapeamento de origem. Mudanças de plano continuam no motor existente. O runtime exige o mesmo ambiente e vendedor/aplicação que o banco. Contratos legados não são consultados com credenciais de produção.

Notificações sem vínculo local conhecido são enfileiradas por ID, sem consultar recursos possivelmente legados com credenciais do outro ambiente. A reconciliação consulta contratos locais do ambiente selecionado; não concede acesso pelo payload ou pelo retorno do navegador. A fila é sinal de investigação, não confirmação financeira. Não é permitido mudar automaticamente o ambiente depois da configuração.

## Independência e limites

A/B não exigem ativar produção no Mercado Pago. As três migrations são sequenciais, transacionais e incrementais: 061 quantidade, 062 Insights, 063 ambientes financeiros. A cadeia histórica de 56 arquivos permanece intacta. Nenhuma alteração foi aplicada ao Supabase ou Neon. A landing `conheca.usesyzia.com.br` não foi acessada ou substituída; o proxy preparado atende somente `/blog`.
