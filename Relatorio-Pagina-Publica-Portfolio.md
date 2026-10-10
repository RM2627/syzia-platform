# Revisão pré-homologação — Página pública e portfólio

Data: 18/09/2026. Projeto cumulativo Fases 2–8 e revisão operacional/onboarding.

**Implementação local concluída. HOMOLOGAÇÃO EXTERNA PENDENTE.** Nenhum Supabase real conectado, deploy, publicação externa, serviço pago ou dado real utilizado. A publicação exercitada nos testes é somente a alteração do snapshot no banco descartável da demo.

## O que mudou

A navegação permanente do gestor agora contém **Página da empresa**. A central, em `/painel/:orgId/pagina`, reúne status real da publicação, URL pública, Ver página pública em nova aba, Copiar link com feedback, Editar página e atalhos destacados para Portfólio, Identidade e aparência, Serviços e preços, Informações públicas, Horários, Disponibilidade, FAQ pública e Publicação.

O link é construído com `window.location.origin` e o slug da organização autenticada. Não há domínio de produção hardcoded. A URL pública única continua `/empresa/:slug`. Quando a cópia automática é negada/indisponível, a tela orienta a selecionar e copiar o campo somente leitura. Não há envio automático a WhatsApp/Instagram, integração externa ou geração de QR Code nesta revisão: o link está pronto para uso nesses canais.

Os controles de publicação existentes foram extraídos para `PagePublication`, reutilizado tanto na central quanto na rota administrativa anterior. Permanecem as verificações de autorização e revisão concorrente, publicação de versão aprovada, visibilidade e preços públicos. A rota anterior continua funcionando.

O editor `PresenceAdmin` é reutilizado, sem novo portfólio. Agora mostra cartões com imagens privadas autenticadas, título, descrição, posição, ativo/inativo e antes/depois; permite editar e remover/incluir na próxima publicação. A retirada é lógica, através do campo `active` já existente, preservando mídia e histórico. Upload, limites, validação no gateway, associação de serviço, ordem de imagens, ordem do trabalho, logo/capa/cores continuam usando os mesmos comandos.

A prévia publicada utiliza `consumer_public_page` e o componente `Portfolio` que já é usado pelo consumidor. Portanto, exibe os mesmos cartões, imagens e ampliação, sem rascunhos. Ver página pública abre a experiência completa real. Uma primeira tentativa de prévia embutida em iframe apresentou reinicialização de estado no navegador; foi substituída pela reutilização direta do componente existente, sem criar uma segunda página.

O onboarding mantém todo o cálculo persistido no banco. Somente os destinos visuais de Identidade visual, Portfólio, Página pública e Publicação foram direcionados à central/subseções. Nenhum progresso artificial foi introduzido.

## Arquivos e estrutura

| Arquivo | Responsabilidade |
|---|---|
| `src/consumer/CompanyPage.tsx` | Central administrativa, status, link/cópia, atalhos e prévia pública |
| `src/consumer/PagePublication.tsx` | Controles existentes de publicação compartilhados entre telas |
| `src/consumer/PresenceAdmin.tsx` | Editor existente, cartões de rascunho, mídia privada e retirada lógica |
| `src/consumer/company-page.css` | Apresentação responsiva da central e cartões |
| `src/consumer/Admin.tsx` | Reutilização de PagePublication sem remover funcionalidades anteriores |
| `src/FoundationApp.tsx` | Rota administrativa protegida e carregamento sob demanda |
| `src/operations/Onboarding.tsx` | Navegação permanente e novos destinos da checklist |
| `tests/company-page.test.mjs` | Autorização direta, revogação e projeção pública |
| `tests/demo-browser/company-page.spec.ts` | Navegação, cópia, mídia, publicação, isolamento e responsividade |
| `docs/public-page-homologation.md` | Roteiro externo preparado, não executado |

README, AGENTS, limites permanentes e escopo da revisão foram atualizados. O pacote inclui código, assets, migrations históricas, scripts, testes, fixtures, lockfile, configurações de exemplo, guias e evidências anteriores.

**Migrations novas: nenhuma. Tabelas/constraints/policies/RPCs novas: nenhuma.** Todas as 24 migrations entregues anteriormente foram comparadas byte a byte com o ZIP anterior e permanecem idênticas; hashes em `reports/page-review-migrations.json`.

Reutilizados: `consumer_pages`, `consumer_publications`, `company_branding`, `company_media`, `portfolio_items`, serviços/configurações/versões existentes e seus mecanismos de RLS/FORCE RLS/auditoria. Comandos: `consumer_admin_context`, `company_context`, `consumer_presence_context`, `consumer_branding_save`, `consumer_portfolio_save`, `consumer_reserve_company_media`, `consumer_publish_page`, `consumer_set_page_enabled`; prévia pública: `consumer_public_page`; mídia: gateway empresarial já existente.

## Segurança

A rota continua dentro do guard de gestor ativo da organização. Atendentes próprios, compartilhados e gestor de B não recebem controles por alterar URL. A autorização do banco continua sendo decisiva: testes diretos exercitam também consumidor e superadmin sem vínculo empresarial, além da revogação do gestor com identidade de sessão mantida.

Imagens de rascunho usam Bearer da sessão do gestor no gateway privado; os blobs temporários são liberados ao desmontar. Nenhuma mídia privada é tornada pública para viabilizar prévia. A prévia do consumidor usa somente a projeção pública existente. Testes verificam ausência de identificadores/estrutura interna; a regressão mantém verificações de notas, dados privados e isolamento de mídia.

## Auditoria de UX

| Intenção do empresário | Caminho disponível |
|---|---|
| Ver como aparece para clientes | Página da empresa → Ver página pública |
| Adicionar fotos | Página da empresa → Portfólio → Enviar fotos para o portfólio |
| Alterar informações públicas | Página da empresa → Informações públicas → editor existente |
| Mandar link pelo WhatsApp | Página da empresa → Copiar link → colar no canal desejado |
| Colocar link no Instagram | Mesmo link completo, sem montagem manual |
| Mostrar página pelo celular | Página da empresa → Ver página pública, com ação junto ao topo |

Inspeção visual realizada em Chromium com desktop 1440×1000, tablet 820×1180 e celular 390×844. Ações de visualizar/copiar estão próximas ao topo; cartões e editor cabem na largura; controles têm alvos de pelo menos 44px na central. Capturas em `reports/visual-company-page/`. Não se trata de certificação de acessibilidade nem teste em dispositivo físico.

## Validação local

As 12 suítes SQL principais totalizam **451 casos aprovados, zero falhas**: Fundação 68; Empresa 71; Consumidor 35; presença/pagamentos opcionais 28; Central 40; Comercial 54; Analytics 27; Billing 50; Trial 42; onboarding 13; operação 16; revisão da página 7. São testes locais em PGlite com claims de Auth simuladas, não Supabase real.

A suíte geral de interface passou **54 testes**, incluindo regressões das fases anteriores, permissões, layout, jornadas do consumidor e estados de erro. Resultado em `reports/browser-results.json` e `reports/page-review-ui-regression.log`. Somada à demo, são **81 casos de navegador únicos aprovados**, sem falhas.

A demo completa passou **27 testes de navegador**, incluindo oito casos da revisão: desktop/tablet/mobile, onboarding com fallback de cópia, três perfis sem autorização e o fluxo de upload/inclusão/ordem/publicação/retirada. Usa supabase-js via HTTP loopback, SQL em PGlite e gateway local com sanitização. Não é Auth/Storage real.

Também foram executados testes de upgrade, ferramentas de homologação em modo local, imagens, configuração, demo HTTP e provedor fictício. Build/TypeScript e inspeção de marcador de segredo server-only no bundle passaram. O novo teste SQL foi incluído em `test:local`. Os scripts abaixo terminaram com código zero; execução registrada por suíte, sem alegar homologação externa:

| Comando | Resultado | Duração aproximada |
|---|---|---|
| `npm run test` | PASS | 4.5 s |
| `npm run test:company-page` | PASS | 3.9 s |
| `npm run test:onboarding` | PASS | 3.4 s |
| `npm run test:operations` | PASS | 3.9 s |
| `npm run test:company` | PASS | 3.4 s |
| `npm run test:homologation-tools` | PASS | 3.0 s |
| `npm run test:company-tools` | PASS | 3.0 s |
| `npm run test:consumer` | PASS | 3.9 s |
| `npm run test:presence-payments` | PASS | 3.8 s |
| `npm run test:central` | PASS | 4.4 s |
| `npm run test:commercial` | PASS | 5.1 s |
| `npm run test:billing` | PASS | 4.7 s |
| `npm run test:trial` | PASS | 4.0 s |
| `npm run test:trial-upgrade` | PASS | 3.4 s |
| `npm run test:billing-provider` | PASS | 0.4 s |
| `npm run test:billing-upgrade` | PASS | 4.4 s |
| `npm run test:billing-tools` | PASS | 0.6 s |
| `npm run test:analytics` | PASS | 4.3 s |
| `npm run test:analytics-upgrade` | PASS | 3.2 s |
| `npm run test:analytics-tools` | PASS | 0.5 s |
| `npm run test:commercial-upgrade` | PASS | 3.5 s |
| `npm run test:commercial-tools` | PASS | 0.7 s |
| `npm run test:central-tools` | PASS | 0.6 s |
| `npm run test:images` | PASS | 0.5 s |
| `npm run test:consumer-tools` | PASS | 0.8 s |
| `npm run test:demo` | PASS | 4.2 s |
| `npm run test:config` | PASS | 0.8 s |
| `npm run build` | PASS | 1.2 s |
| `npm run check:bundle` | PASS | 1.4 s |

Evidências: `reports/page-review-regression.json` e logs em `reports/page-review-runs/`; `reports/company-page-sql.json`; `reports/page-review-demo-regression.json` (27 casos); `reports/demo-browser-results.json` (reexecução final dos oito casos específicos, sem somá-los duas vezes); `reports/page-review-demo-regression.log`; comparação de migrations e capturas mencionadas acima.

## Correções encontradas durante a revisão

- Gerenciamento público antes escondido em configuração genérica: navegação e central dedicadas reutilizando editores.
- Link precisava ser descoberto/montado: URL completa com cópia e feedback, sem domínio fixo.
- Portfólio listado somente como texto: cartões com imagens privadas, formato, ordem e controles; prévia do snapshot público com componente compartilhado.
- Prévia experimental em iframe perdeu estado durante teste: substituída por cartões públicos existentes; nova aba continua sendo a forma de visualizar toda a página.
- Ajuste visual após inspeção: título mais compacto e ações legíveis no celular/tablet.
- Teste inicial de autorização de rota foi fortalecido para usar o identificador real da organização A criada na demo, em vez de UUID inexistente.

## Limitações e pendências externas

- A publicação continua baseada no manual aprovado existente. A decisão de desacoplar publicação comercial e manual interno, registrada na revisão anterior, não foi alterada por esta solicitação. A central explica a necessidade de versão aprovada.
- Remover trabalho significa desativar para a próxima publicação, não apagar mídia/histórico. Só a publicação seguinte muda a versão visível.
- A prévia embutida cobre o portfólio publicado usando o mesmo componente do consumidor. A página completa é vista pela ação Ver página pública.
- FAQ/informações/serviços continuam nas telas existentes com acesso direto da central; não foi criado editor/modelo paralelo.
- Clipboard automático depende do navegador/contexto seguro; fallback manual implementado e testado.
- Auth/SMTP, PostgREST, Storage, JWT reais, dispositivos físicos e comportamento em domínio configurado permanecem **PENDENTES DE HOMOLOGAÇÃO EXTERNA**. Guia preparado em `docs/public-page-homologation.md`.
- Concorrência com PostgreSQL nativo independente e backup/restauração continuam com os limites e pendências documentados nos relatórios anteriores. Não foram apresentados como executados nesta revisão.

Entrega cumulativa completa em `Projeto-Fase-8-Final.zip`, com manifesto de integridade. Nenhuma nova fase iniciada. Aguardar autorização após esta entrega.
