# VIRELOQ — correção de presença pública sobre a 030

Entrega de 22/09/2026. Base exclusiva: `VIRELOQ-030-Consolidado.zip`. Correção local concluída para homologação do proprietário, sem deploy ou acesso ao ambiente real.

## O que foi corrigido

- **Categorias:** criar uma categoria dentro do cadastro/edição do serviço, persistir na organização atual, selecionar automaticamente e disponibilizar nos próximos serviços. As categorias existentes e as regras de duplicidade da 030 foram reutilizadas. Criar a categoria preserva os outros campos preenchidos.
- **Página da empresa:** sequência clara de Identidade visual, Catálogo, Portfólio, Prévia e Publicação. A área de agenda/solicitações aponta para o editor de presença e para a configuração de pagamentos.
- **Imagens:** logo, capa e imagem do serviço têm upload próprio, prévia, troca e remoção. Upload concluído preserva os campos alterados durante o envio. URLs antigas de serviços continuam compatíveis.
- **Cores:** sugestões visuais, seletor nativo, HEX opcional, prévia imediata e restauração do padrão VIRELOQ. O texto do botão usa preto ou branco conforme o contraste; os textos de conteúdo mantêm cor legível. O hover das ações do editor também foi corrigido na conferência visual.
- **Catálogo:** categorias existentes e serviços em listas ordenáveis por arrastar ou por botões Subir/Descer. A ordem é persistida, sem outro sistema de categorias.
- **Portfólio:** cards e formulário dedicado para foto única, antes/depois e galeria. Upload contextual, miniaturas, ampliação da foto de galeria, remoção e ordem das fotos; edição, ocultação, ordem e exclusão de trabalhos. Os estados distinguem rascunho e publicação.
- **Prévia:** renderiza o componente real da página pública com os dados salvos do rascunho e imagens autenticadas. Mostra claramente que é uma prévia privada. Não envia solicitações nem abre a área de pedidos do consumidor.
- **Publicação:** checklist com requisitos obrigatórios explicados e opcionais que não bloqueiam; ação explícita após revisão. Salvar, ocultar ou excluir no rascunho não altera a publicação vigente. O backend recusa publicação de uma versão diferente da revisada.
- **Pagamentos:** apresentação simples em Configuração → Formas de pagamento aceitas, com Pix, dinheiro, cartão presencial, transferência e campo adicional. A preparação técnica futura foi preservada sem ocupar a experiência normal.

## Migration 031: necessidade e alcance

A inspeção da 030 encontrou limitações persistentes: restrição a cinco cores, ausência de vínculo entre serviço e mídia própria, publicação dependente de aprovação do manual operacional e ausência de exclusão de trabalho por RPC. A justificativa detalhada está em `backend-decision.md`.

A 031 reutiliza as tabelas, o gateway e os snapshots existentes. Não cria outro catálogo, sistema de categorias, portfólio ou página. Publicações antigas mantêm seu manual; novas publicações de conteúdo público não aprovam nem alteram o manual de atendimento. A integração do checklist de onboarding reconhece essas publicações, preservando o progresso.

As operações de presença respeitam as permissões granulares da 030. A prévia completa exige leitura dos módulos de origem; publicar e editar exigem as respectivas permissões. O acesso à imagem de serviço permanece restrito à empresa e ao vínculo autorizado. As políticas RLS, os papéis, as concessões existentes e o helper compartilhado de autorização não foram alterados.

**Aplicar somente a 031 sobre uma instalação 030**, antes do frontend atualizado. O procedimento está em `upgrade.md`.

## Validação executada

| Verificação | Resultado | Evidência |
|---|---|---|
| TypeScript e build de produção local | Aprovado: `tsc --noEmit && vite build` | `reports/presence-correction/build.log` |
| Backend em PGlite | 10 casos aprovados | `backend.json` e `backend.log` |
| Contraste da cor livre | 1 caso aprovado, com 4.096 cores amostradas e fallback inválido | `contrast.log` |
| Jornada de navegador | 4 cenários aprovados, Chromium local | `browser.json` e `browser.log` |
| Conferência final do hover do editor | Jornada desktop repetida após ajuste visual | `browser-desktop-final.log` |
| Integridade da base | 30 migrations e 29 arquivos de módulos protegidos idênticos à 030 | `integrity.json` |

São **15 casos únicos focados**; a repetição final de desktop verifica o ajuste de contraste e não representa uma nova suíte. Não foram executadas a auditoria mestre, a bateria completa da 030 ou suítes de módulos não alterados.

Os 10 casos de backend cobrem: preservação de dados no upgrade; categorias e isolamento A/B; logo/capa/HEX e mídia de outra empresa; imagem de serviço privada/publicada/removida; três formatos de portfólio e preservação do snapshot; prévia sem efeitos e rejeição de versão desatualizada; preço publicado preservado durante edição do rascunho; publicação de empresa nova sem manual e sem bloqueio por opcionais; permissões granulares; solicitações nas publicações antiga e nova com adicionais e respostas obrigatórias.

A jornada desktop cobre a categoria dentro do serviço, preservação do formulário, upload da imagem, reutilização da categoria, logo/capa/cor, ordenação por botões e arrastar, recarga, prévia, publicação e manutenção da versão pública durante nova edição. A segunda jornada cobre os três formatos de trabalho, fotos de galeria, ampliação, remoção, edição, ordem, ocultação, exclusão e formas de pagamento. Tablet (820×1180) e celular (390×844) verificam edição, ausência de transbordamento horizontal, modal antes/depois, Escape/retorno de foco e prévia. Desktop usa 1440×1000.

Durante a validação foram corrigidos o reconhecimento da publicação no checklist, a chamada interna de autorização no upload delegado, a preservação dos campos durante uploads e o contraste do hover. Também foram ajustados seletores dos testes aos controles reais. Os relatórios finais registram os resultados após essas correções.

## Capturas e arquivos

As capturas estão em `reports/presence-correction/`: `service-desktop.png`, `identity-desktop.png`, `identity-tablet.png`, `identity-mobile.png`, `portfolio-desktop.png`, `portfolio-editor-desktop.png`, `portfolio-editor-tablet.png`, `portfolio-editor-mobile.png`, `preview-desktop.png`, `preview-tablet.png` e `preview-mobile.png`.

A lista exata de arquivos alterados/adicionados está em `docs/presence-correction/changed-files.md`. O ZIP contém o projeto cumulativo completo: código, migrations 001–031, lockfile, configurações de exemplo, scripts, fixtures, testes, documentação, histórico, capturas e relatórios. Dependências instaladas, caches e build gerado ficam fora do pacote; `MANIFEST.json` contém os hashes dos arquivos entregues.

## Preservação e limites

As migrations 001–030 foram comparadas byte a byte com o ZIP original. Financeiro, métricas, billing, acesso empresarial, permissões e servidor tiveram seus arquivos de código comparados e preservados. Categorias, serviços, identidade, portfólio e publicações da fixture 030 foram comparados antes/depois da migration sem regravação. O estado de manual publicado e atendimento humano permanece igual após publicar a página.

O teste é **local**, com empresas, contas e imagens fictícias. PGlite e o gateway demonstrativo não comprovam Supabase real, PostgREST, Storage remoto, concorrência PostgreSQL nativa, envio externo ou produção. A homologação dessas dependências não foi executada. Os testes e relatórios históricos das versões anteriores foram preservados; não representam revalidação nesta entrega.

Mantidos os limites existentes: JPG/PNG/WebP de até 5 MB, até quatro fotos por trabalho e até 30 trabalhos. Imagens removidas do rascunho não são apagadas de snapshots ainda publicados. Formas de pagamento são informações comerciais; não ativam gateway nem confirmam recebimentos.

Nenhuma funcionalidade de Financeiro, Métricas, trial, billing, primeiro acesso, CPF/CNPJ ou suporte autorizado foi reconstruída. Não houve acesso a dados reais, deploy, nova fase ou produção de vídeo nesta correção. A entrega encerra o trabalho para homologação do proprietário.
