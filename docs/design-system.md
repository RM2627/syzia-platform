# Design system — produto cumulativo Fases 2–8

`src/ui/design-system.css` complementa os estilos existentes sem mudar autorização/snapshots. Primitivos React: `Metric`, `Skeleton`, `Empty`. Sem biblioteca adicional nem fonte externa obrigatória.

| Elemento | Regra |
|---|---|
| Tipografia | System/Inter disponível, corpo 16px, títulos fluidos e números tabulares |
| Ritmo | Base 8px, espaçamentos 16/24/32; painéis 19–26px |
| Cores | Fundo claro, texto petróleo, ação verde; status também textual |
| Grid/cards | Elásticos, bordas discretas, raio 12–14px e sombra leve |
| Navegação | Sidebar contrastante, navegação móvel compacta e abas empresariais roláveis |
| Controles | Rótulos acessíveis, toque ≥44px, foco/disabled/erro explícitos |
| Feedback | Skeleton/estado vazio/retry; erros removem indicadores antigos |
| Gráficos | `meter`, texto e tabela diária; informação não depende apenas de cor |
| Movimento | Respeitar `prefers-reduced-motion` |

Público usa exclusivamente identidade e conteúdo publicados. Logos/capas continuam no fluxo autorizado de mídia. A/B demonstram estilos verde/editorial e terracota/serifado, mantendo a paleta controlada existente. Hero prioriza empresa/ação; catálogo mantém preço, estimativa, duração, orçamento e agenda. Fallback abstrato evita impor carro a empresas de outros segmentos. SVGs editáveis em `assets/demo` são ilustrações fictícias, convertidas/publicadas pela fixture; não comprovam serviços reais.

Fundação/Empresa/Central/Comercial compartilham acabamento de shell, cards, campos e navegação. Dashboards carregados sob demanda, sem listar PII. Evidências em `reports/visual-phase7`: público A/B e analytics em desktop 1440×1000, tablet 820×1180 e mobile 390×844; áreas autenticadas também inspecionadas. Testes de overflow e navegação não equivalem a certificação WCAG ou testes Safari/Firefox/aparelhos físicos, ainda pendentes.


## Acabamento final da Fase 8

Menu compacto expansível no celular com estado aria-expanded e fechamento ao navegar. Sidebar e áreas operacionais preservam densidade e atalhos; planos utilizam cartões comparáveis, medidores de uso, estados textuais, histórico e confirmação de ações. A mesma base tipográfica/cromática atende a Fundação, Empresa, Central, Comercial, Analytics e Billing.

`src/ui/Dialog.tsx` usa dialog nativo, modal com fundo inerte, Escape e devolução de foco ao controle original, inclusive sob StrictMode. `src/consumer/Gallery.tsx` oferece galeria/antes-depois, imagem ampliada em object-fit:contain, navegação por botões/teclado e gesto horizontal. Miniaturas usam object-fit:cover; serviço sem foto tem fallback tipográfico/gradiente, independente de segmento.

Fotografias sintéticas locais foram incluídas nas duas identidades. Origem/prompts e licitude de uso fictício documentados em assets/demo/IMAGE-PROVENANCE.md. Nenhuma imagem representa cliente/trabalho real. Empresa A usa verde com títulos sem serifa; B terracota, composição curva e títulos serifados. Sem fonte remota obrigatória.

Skeleton público, erro com retry, nomes longos, 24 serviços e fotos verticais/horizontais possuem cobertura local. Evidências atualizadas em reports/visual-phase8: público A/B, acompanhamento, Central, Comercial, empresa, Analytics, assinatura e administração. Desktop 1440px, notebook 1366px, tablet 820px, smartphone 390px. Isso não certifica WCAG nem substitui Safari/Firefox, leitor de tela ou aparelhos físicos.

A página pública carrega o módulo consumidor diretamente. Shell autenticado, Central, Comercial, Analytics e Billing são lazy. Preservar essa separação ao adicionar telas. O estado de erro/revogação deve limpar dados anteriores, não exibir confirmação falsa nem manter indicadores de outra organização.


## Complemento de trial

TrialPanel reutiliza painéis, badges, modais e feedback. Prazo restante é acompanhado de data/hora exata e consequência do encerramento. Análise, verificação, política e extensão são formulários administrativos com motivo/atestação, histórico com rótulos legíveis e erro dentro do modal. Capturas em reports/visual-trial, desktop e celular.
