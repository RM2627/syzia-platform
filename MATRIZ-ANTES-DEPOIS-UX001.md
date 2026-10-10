# UX-001 — matriz antes × depois

Base anterior: SYZIA-044-UX-Final-Consolidado. Mesma fixture sintética descartável e builds de produção, Chromium 153.0.8010.0. Latência controlada: API/mídia 120 ms; chunks JavaScript 250 ms. Nenhum backend real foi usado.

## Resultado por tamanho

| Largura | Abrir: contexto anterior → atual | Aba anterior → atual | Cliques para abrir dois tickets* | RPC de fila na abertura | RPC de ticket na abertura | Overflow depois |
|---|---|---|---|---|---|---|
| 1440 px | Central global → painel empresarial | Minha fila → Todos | 3 → 2 | 1 → 0 | 1 → 1 | 0 px |
| 390 px | Central global → painel empresarial | Minha fila → Todos | 3 → 2 | 1 → 0 | 1 → 1 | 0 px |
| 320 px | Central global → painel empresarial | Minha fila → Todos | 3 → 2 | 1 → 0 | 1 → 1 | 0 px |

*Partindo da fila “Todos” já selecionada: antes, abrir o primeiro ticket, selecionar “Todos” novamente e abrir o segundo; depois, abrir o primeiro e o segundo diretamente. A seleção inicial do filtro é comum aos dois cenários e não entra nessa contagem.

A origem empresarial anterior usava /central/:code. Depois usa /painel/:empresa/atendimento?ticket=:code. Em Pendências, a seleção permanece em /painel/:empresa/pendencias?ticket=:code, preservando a fila da própria área. A Central global continua em /central/:code.

## Janelas observadas

As durações abaixo incluem a ação e uma espera de estabilização de rede de pelo menos 650 ms. São registros locais comparáveis, não LCP, tempo de resposta puro, benchmark estatístico ou promessa de produção. “Outras” inclui autorização, onboarding e atividade de sessão. Polling legítimo pode coincidir com uma janela.

| Ação | Janela ms antes → depois | central_context antes → depois | central_queue antes → depois | Outras requests antes → depois | Navegação empresarial depois |
|---|---:|---:|---:|---:|---|
| open-1440 | 981 → 875 | 1 → 1 | 1 → 0 | 0 → 0 | Preservada |
| switch-1440 | 886 → 872 | 1 → 1 | 0 → 0 | 0 → 0 | Preservada |
| back-1440 | 857 → 1586 | 1 → 1 | 0 → 0 | 0 → 1 | Preservada |
| forward-1440 | 846 → 845 | 1 → 1 | 0 → 0 | 0 → 0 | Preservada |
| reload-1440 | 2061 → 2201 | 1 → 1 | 1 → 1 | 3 → 6 | Preservada |
| open-390 | 972 → 876 | 1 → 1 | 1 → 0 | 0 → 0 | Preservada |
| switch-390 | 882 → 884 | 1 → 1 | 0 → 0 | 0 → 0 | Preservada |
| back-390 | 846 → 859 | 1 → 1 | 0 → 0 | 0 → 0 | Preservada |
| forward-390 | 847 → 951 | 1 → 1 | 0 → 0 | 0 → 1 | Preservada |
| reload-390 | 2050 → 2182 | 1 → 1 | 1 → 1 | 3 → 6 | Preservada |
| open-320 | 974 → 1006 | 1 → 1 | 1 → 0 | 0 → 0 | Preservada |
| switch-320 | 871 → 922 | 1 → 1 | 0 → 0 | 0 → 0 | Preservada |
| back-320 | 860 → 1630 | 1 → 1 | 0 → 0 | 0 → 1 | Preservada |
| forward-320 | 846 → 851 | 1 → 1 | 0 → 0 | 0 → 0 | Preservada |
| reload-320 | 2055 → 2187 | 1 → 1 | 1 → 1 | 3 → 6 | Preservada |

Ao recarregar o documento, a versão anterior estava na Central global e a atual está no painel empresarial: permissões e onboarding empresariais são novamente validados. Por isso a contagem total de reload pode ser maior; essas validações foram preservadas deliberadamente (UX-002 adiado). Apenas mudar o ticket na mesma área não reinicia a fila, permissões nem onboarding.

## Evidências visuais e rastros

| Tela | Antes | Depois |
|---|---|---|
| Abertura 1440 px | [Captura](reports/ux001/before/open-1440.png) | [Captura](reports/ux001/after/open-1440.png) |
| Abertura 390 px | [Captura](reports/ux001/before/open-390.png) | [Captura](reports/ux001/after/open-390.png) |
| Abertura 320 px | [Captura](reports/ux001/before/open-320.png) | [Captura](reports/ux001/after/open-320.png) |

Dados brutos: [antes](reports/ux001/before/measurements.json), [depois](reports/ux001/after/measurements.json). Cada pasta contém traces Playwright para as três larguras. [Comparação automática](reports/ux001/comparison-checks.json): PASS. Capturas adicionais em reports/ux001/screenshots/: origens, Central global, negação entre empresas, duas empresas autorizadas e notificação.

A troca com resposta artificialmente atrasada foi validada no navegador: o ticket anterior desaparece e apenas o painel local mostra “Abrindo contexto autorizado…”, até a resposta autorizada do ticket novo. O shell empresarial permanece.
