# Auditoria prévia — versatilidade multissegmento

Inspeção realizada antes das alterações de implementação desta revisão.

| Área | Evidência no código atual | Decisão |
|---|---|---|
| Portfólio | `portfolio_items.format` aceita gallery/before_after, padrão gallery; 1–4 imagens e somente before_after exige 2. PresenceAdmin inicia gallery. Gallery renderiza fotos comuns sem rótulos comparativos. | Preservar schema, Storage, snapshots, ordenação e comandos. Explicitar na ajuda que imagem única/projeto já funcionam. |
| Público | Consumer.tsx impõe “Escolha o cuidado que precisa”, “Cuidado que você pode ver”, “BEM CUIDADO” e “Mais cuidado” independentemente da empresa. | Problema real de linguagem para projetos/manutenção. Trocar somente a redação fixa por serviços/atendimento/trabalhos. |
| Central da página | Atalho enfatiza “fotos e comparações antes e depois”. | Incluir trabalhos/projetos e tornar comparação claramente opcional na descrição. Preservar tela e links. |
| Serviços/preços | fixed/from/quote; orçamento, duração, adicionais, campos dinâmicos, direct_booking. Nenhum campo de veículo obrigatório no produto. | Preservar. Exemplos automotivos estão em fixtures e pertencem à empresa A. |
| Onboarding | Checklist persistida, portfólio opcional; horários/serviços/preços genéricos. | Preservar código e banco. Sem profissão obrigatória. |
| Fluxo consumidor | Nome/contato/consentimentos, perguntas por serviço, imagens opcionais, orçamento/agenda/acompanhamento administrativo. | Preservar. Não adicionar dados clínicos. |
| Identidade/visual | Logo, capa, paleta e fallback abstrato. Não há ilustração de veículo fixa no produto. | Preservar. Imagens automotivas pertencem somente à fixture A. |
| Cenário B | Fixtures presence/analytics-demo já configuram designer, galeria de uma imagem, preços e perguntas próprias. | Reutilizar integralmente para demonstrar cenário B. |
| Cenário C | Ainda não há fixture de profissional com consulta sem portfólio. | Acrescentar somente massa fictícia de nutricionista e testes usando as mesmas tabelas/RPCs. |

Hipóteses que não justificam alteração: novo tipo de portfólio, seleção de profissão, page builder, módulos clínicos, novos preços/modelos de contratação, reescrita de publicação. Não existem impedimentos estruturais de segmento nos pontos auditados.

Achado adicional na inspeção visual do cenário C: o fallback sem capa usava fundo escuro e texto herdado escuro. Correção localizada de contraste somente no fallback, sem alterar composição ou personalização. Usar capa/portfólio continua opcional.

Outro texto fixo identificado: “Planeje sua visita” pressupunha atendimento no local. Alterado para “Planeje seu atendimento”, compatível também com serviço remoto/domiciliar. Horários/endereço continuam usando os mesmos dados.
