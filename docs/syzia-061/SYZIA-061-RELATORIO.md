# SYZIA 061 — relatório da entrega integrada

**Situação: implementação local preparada para revisão; homologação global NÃO aprovada.** Build/typecheck, testes específicos e navegador da 061 passaram a partir de uma extração limpa. O gate histórico continua reprovado. Não promover esta base automaticamente.

Origem exclusiva: `RM2627/syzia-platform`, commit `6e9cacae053e964b063f0e533e0b752bdddaa869`. Trabalho na branch local `syzia-061-integrada`, sem commit, push ou merge. A referência oficial foi conferida no início; não foi sobrescrita por ZIP antigo. O escopo integral está em `ESCOPO.md`.

## Resultado por módulo

### A — SYZIA Insights

Implementado no backend unificado e na administração existente: HTML público SSR, catálogo, categorias, busca, guias/materiais editoriais, paginação, artigos relacionados, populares por leituras registradas, canonical, títulos/descrições por artigo e seleção, Open Graph/Twitter, JSON-LD, sitemap, 301 e 404. A logo oficial foi reutilizada sem alteração. Administração e prévias não são conteúdo público indexável.

Editor React por blocos, rascunhos, duplicação, versões, restauração, publicação/despublicação, arquivamento, agendamento, categorias, tags, autores, SEO, prévia privada, salvamento e controle de revisão. Autorização editorial explícita no servidor; usuários empresariais comuns não recebem acesso. Agendamento usa job Node idempotente, falhas auditadas e retry com backoff; instância suspensa pode atrasar a execução.

Biblioteca de mídia com upload autenticado, seleção visual, alt text, exclusão de arquivos não referenciados e proteção das revisões. Raster reencodado em WebP, limites de resolução/tamanho e remoção de metadados. Nenhum storage ou serviço novo contratado.

Curtidas persistentes, curtir/descurtir, identidade autenticada quando verificável e cookie pseudônimo para visitantes. Unicidade no banco, CSRF, limitação de frequência e ausência de identidades no contador público. Compartilhamentos registram cliques de intenção, não compartilhamentos supostamente concluídos.

Formulário de interesse integrado ao cadastro de aquisição existente, com consentimento contextual, validação, antispam, deduplicação e origem editorial/UTMs. Não cria assinatura nem autorização fictícia para campanhas. Estatísticas por período/categoria/artigo usam eventos reais; leitura é opcional, visitantes são estimados, retenção de eventos é de 90 dias. Não há pixels de publicidade.

Cinco artigos completos estão em `content/insights/drafts-061.json`, para importação explícita como **rascunhos**, sem publicação automática. O importador é offline por padrão. Monetização tem pontos de extensão desativados; não há AdSense, afiliados ativos, comércio de material digital ou cobranças.

**Limites de aquisição:** os CTAs aceitam links de demonstrações já publicadas na infraestrutura comercial existente. Não foi inventado um endereço de demo nem liberado um convite privado para todos. Os rascunhos apontam inicialmente para `/contato`. A demo pública apropriada deve ser escolhida e conferida pelo proprietário. Atribuição de acesso efetivo à demo e conversão em assinante entre origens não foi implementada; cliques não são contabilizados como contratação. O módulo não é apresentado como funil de conversão integralmente homologado.

### B — quantidade na contratação pública

Configuração individual desligada por padrão: habilitação, mínimo, máximo, unidade e duração fixa/proporcional/manual. Limite de 1 a 100 preserva o limite do motor de orçamentos. Interface pública acessível, resumo, valor unitário e estimativa; serviço sob consulta não recebe preço inventado. Serviços desabilitados preservam o payload legado.

O SQL resolve preço oficial e quantidade, calcula em centavos, cobra adicionais uma vez por serviço selecionado e preserva a política no snapshot. Quantidade fica nos itens iniciais do orçamento, inclusive conversão de pedidos de ajuda. Os caminhos legados também recusam uma unidade quando o serviço exige mínimo maior. Duração manual exige avaliação; não se transforma em aceite direto.

Foi testada a cadeia configuração → publicação → pedido com 3 unidades → orçamento → reserva de 180 minutos. Um período adulterado de 60 minutos foi recusado sem reserva. Também foi testada solicitação manual com 2 unidades, revisão empresarial para 4 unidades e 90 minutos totais, proposta, aprovação e confirmação posterior de horário. Aprovar proposta e confirmar agenda continuam ações distintas. Publicar uma nova configuração não reescreve pedidos anteriores.

Snapshots do Studio preservam os campos habilitados e mantêm a representação legada quando a quantidade está desligada. Regras financeiras de preço de planos/trial não são alteradas por este módulo.

**Limite de validação:** não houve envio de notificações externas, nem revisão de cada canal/template histórico de mensagem. A persistência e os fluxos operacionais cobertos estão descritos na matriz; não se afirma homologação de mensagens remotas.

### C — preparação da transição Mercado Pago

Implementados registros por ambiente, novas ofertas/versões comerciais, vínculo imutável do contrato com seu ambiente/mapeamento de origem e configuração atômica/idempotente. A proteção `billing_mapping_in_use` continua vigente. Contratos e planos históricos não são apagados nem remapeados. O padrão da migração é `legacy`.

Ferramenta separada de produção: offline por padrão; validação somente de leitura dos seis planos; aplicação futura exige confirmação explícita, digest, lote e validação da identidade do vendedor/aplicação. Não usa `--apply-test` como ativação de produção. Valores de R$ 49,90, R$ 89,90 e R$ 149,90, BRL/mês e trial de sete dias permanecem preservados.

Runtime, notificações e reconciliação respeitam ambiente. Notificação sem vínculo conhecido é enfileirada, sem buscar possível recurso sandbox com credencial de produção. Essa fila não confirma pagamento. Mapeamento de produção é bloqueado enquanto houver contratos legados ativos/incertos incompatíveis. Cancelamento definitivo e período de acesso remanescente são avaliados separadamente.

**Nenhum dos seis planos reais foi reconsultado nesta execução.** A informação fornecida pelo proprietário permanece evidência histórica. Validação dos IDs/conta/ambiente, notificações reais, MP-01, credenciais, callbacks e primeira assinatura real continuam pendentes de autorização externa. Os testes usam gateway simulado; não comprovam aprovação real pelo Mercado Pago.

## Preservação e migrations

- Inventário de origem: 1.240 arquivos, sem remoções; 16 arquivos existentes modificados, listados em `INVENTARIO.md`.
- As 56 migrations históricas foram comparadas byte a byte com os blobs do commit oficial e permanecem intactas no ZIP.
- Somente três migrations novas: `202610280061_service_quantities.sql`, `202610280062_insights.sql` e `202610280063_billing_environments.sql`.
- Cadeia incremental transacional, RLS/FORCE RLS, grants delimitados e testes de upgrade/rollback sobre dados fictícios. Nenhum SQL remoto executado.
- Lockfile, gateway financeiro Mercado Pago, testes/manifests históricos e helper de integridade histórico não foram modificados.
- Manifesto adicional da 061 deriva os hashes anteriores diretamente de Git e fixa as transições reais. Textos explicitamente enumerados aceitam apenas LF/CRLF comprovados, inclusive SQL; binários mantêm comparação exata. Testes negativos continuam rejeitando alteração de conteúdo, predecessor incorreto, bytes binários, CR isolado e texto inválido.

## Resultados verificáveis

Ambiente: Linux, Node 24, Chromium e PostgreSQL embarcado PGlite descartável. Dados fictícios. Autenticação do harness de navegador e gateway financeiro são simulados; componentes React, handlers HTTP e funções SQL exercitados são os desta base.

| Execução na base limpa extraída | Resultado |
|---|---|
| `npm ci` | PASS |
| `npm run build` (inclui TypeScript) | PASS |
| `npm run test:061` | PASS — 39 testes reportados pelo runner |
| `npm run test:061:browser` | PASS — 12 verificações, 1440/390/360 px |
| Prettier nos novos módulos/testes/ferramentas indicados no log | PASS |
| `npm run test:current-gate` | **FAIL** — etapa inicial `commercial-055` |

Não existe script ESLint dedicado nesta base; formatação não é apresentada como uma análise lint independente. As regras TypeScript foram verificadas pelo build.

Uma execução diagnóstica separada continuou as **35 etapas** do gate, sem suprimir assertivas: **21 etapas PASS e 14 FAIL**. Esses são os resultados daquela execução, não uma homologação do estado final. O script diagnóstico registra timeout como falha, não como aprovação. O comando oficial permanece intacto e para na primeira etapa reprovada.

Após correções locais necessárias, houve retestes direcionados, preservando as assertivas históricas:

- Compatibilidade do snapshot demonstrativo: **12 testes PASS**.
- Nove casos de navegador antes reprovados: **7 PASS e 2 FAIL**. Foi atualizado o schema do fixture operacional local e preservado o payload de seleção legada.
- Caso `HF-B01`: **PASS**, após atualização do fixture local.
- As duas falhas restantes de portfólio foram reproduzidas também na base oficial intacta.

Esses retestes **não transformam retroativamente a execução de 35 etapas em PASS**. A suíte completa não foi repetida após cada correção pontual. Logs originais e retestes estão separados nas evidências.

## Falhas e pendências do gate

1. **Integridade histórica incompatível com a própria origem atual.** O gate espera quantidades de migrations/hashes de versões anteriores; por exemplo, 055 espera 52 migrations, a base oficial já possui 56 e a 061 possui 59. Existem também hashes antigos para `.env.demo.example` e outros arquivos não alterados pela 061. Na cópia intacta do mesmo commit, 16 verificações de integridade histórica resultaram em 6 PASS/10 FAIL. Não foram trocados hashes históricos para produzir aprovação artificial. É necessária reconciliação explícita dos manifests históricos com a sequência de bases autorizadas.
2. **SMTP histórico.** Divergência `email_authentication_failed` versus `email_delivery_failed` reproduzida na base intacta. Sem envio de e-mail real e sem mudança de infraestrutura.
3. **Portfólio histórico.** Dois testes esperam duas miniaturas e obtêm zero; ambos também falham na origem intacta. Não foi feita alteração funcional fora do escopo para mascará-los.
4. **Outros testes antigos de navegador.** Falhas em UX-001 mobile, navegação de suporte flexível e login do harness comercial 055 continuam pendentes de classificação/correção. Não há evidência suficiente para atribuir todas a regressão da 061 ou declarar todas preexistentes.

## Limitações e gates de autorização

- Sem execução Windows, concorrência com múltiplas conexões PostgreSQL nativas, PostgREST real, ensaio de carga, certificado/DNS, Search Console ou Core Web Vitals em tráfego real.
- O fixture PGlite serializa transações: verifica idempotência/revisão, mas não substitui corrida real entre conexões.
- Acessibilidade verificada por navegação/teclado, foco e limites visuais; não houve certificação WCAG completa.
- Rate limit HTTP é por instância e pode agregar visitantes atrás de proxy. Monitorar e homologar capacidade antes de tráfego público.
- Mídias ocupam o banco existente; revisar orçamento de armazenamento e backup antes de expansão.
- Hospedagem suspensa atrasa SSR inicial e job editorial. Horário programado exige runtime disponível.
- Rotas de blog, robots.txt raiz, domínio/cookies e CORS precisam ser integrados posteriormente na hospedagem real. O exemplo Cloudflare não foi publicado; landing de pré-lançamento não foi substituída.
- Revisar política de dados aplicável a métricas/formulário e escolher destinos públicos de CTA antes da publicação.
- Aplicação de migrations, configuração do banco demonstrativo, mapeamento real financeiro, mudanças de variáveis, push e deploy exigem autorização posterior.

## Arquivos da entrega e próximo passo

Base completa limpa, patch incremental, inventário SHA-256, este relatório, matriz e guias de editor/aquisição/quantidade/implantação/Mercado Pago. Evidências desta execução ficam em pacote separado; não foi recopiado o acervo bruto de rodadas antigas. Logs históricos que já eram arquivos versionados abrangidos pela integridade da origem foram preservados na base.

**Próximo passo: revisar localmente os três módulos e resolver/aceitar formalmente as pendências do gate antes de qualquer integração ou publicação.** Nenhum ambiente real foi modificado. Não há declaração de feature freeze aprovado, ativação financeira em produção ou homologação integral.
