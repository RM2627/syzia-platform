# Matriz de validação — SYZIA 061

Ambiente local Linux, Node 24, PostgreSQL embarcado em PGlite, HTTP local e Chromium. Dados fictícios. Nenhum e-mail, conta, assinatura ou cobrança real. O transporte de autenticação do harness de navegador é simulado; as funções SQL e os componentes executados são os reais desta base.

| Área | Verificação efetivamente executada | Evidência |
|---|---|---|
| Integridade | Todos os 1.240 arquivos da origem; 16 transições autorizadas; 56 migrations históricas preservadas; exatamente 3 migrations novas | `integrity.test.mjs`; hashes fixados, negativos de código, SQL, binário e predecessor |
| Finais de linha | LF/CRLF somente na lista explícita de textos; alteração de conteúdo continua recusada; inclusive SQL sem nenhuma alteração de conteúdo; bytes originais preservados no ZIP | `integrity.test.mjs` |
| Editor | Autorização, tenant comum/anon/role de serviço recusados; concessão explícita e revogação | `insights.test.mjs` |
| Conteúdo | Rascunho privado, publicação, edição independente, revisões, restauração, concorrência otimista e estados com revisão | `insights.test.mjs` |
| Agenda editorial | Agendamento server-side, execução única, falha, backoff e ausência de publicação inválida | `insights.test.mjs` |
| Segurança editorial | XSS, links proibidos, slug/301, HTML indexável sem JS, RLS/FORCE RLS | `insights.test.mjs`, `http.test.mjs` |
| Mídia | Raster reencodado em WebP, metadados removidos, SVG recusado, limite de corpo, autenticação, privacidade e proteção de revisões | `http.test.mjs`, `insights.test.mjs` |
| Curtidas | Persistência, unicidade, descurtir, sessão verificada versus token inválido e separação de navegador | SQL/HTTP e navegador |
| Leads/medição | Consentimento real obrigatório, deduplicação, cadastro de aquisição existente, origem, contador de eventos; identidades não públicas | `insights.test.mjs`, HTTP |
| Responsividade | HTML público, artigo e editor reais em 1440/390/360 px; teclado, limites de largura, salvamento e prévia | `npm run test:061:browser` — 12 verificações |
| Quantidade | Default legado, mínimo/máximo, inteiros inválidos, preço oficial, adicionais uma vez, sob consulta e 3 regras de duração | `quantity.test.mjs`, `quantity-flow.test.mjs` |
| Persistência | Configuração → publicação → pedido → itens do orçamento; mesma chave mantém mesmo pedido; original imutável | `quantity-flow.test.mjs` |
| Agenda | 3 unidades geram 180 minutos; plano de 60 minutos adulterado é recusado sem reserva; isolamento A/B | `quantity-flow.test.mjs` |
| Proposta revista | Duração manual, quantidade alterada de 2 para 4, proposta de 90 minutos totais, aprovação distinta da escolha/confirmação de horário | `quantity-flow.test.mjs` |
| UI da quantidade | Componente público real; 1440/390/360 px; mais/menos, limite e ArrowDown; preço calculado pelo serviço | Navegador; payload legado sem campo adicional |
| Transição financeira | Seis referências, attestation obrigatória, identidade, proibição de reutilização de plano histórico, rollback e idempotência de lote | `billing.test.mjs`, provedor simulado |
| Contrato legado | Cancelado/cancel_scheduled preservado; não consultado com credencial do novo ambiente; reserva de trial mantida | `billing.test.mjs` |
| Nova oferta | Trial, ambiente, sem assinatura duplicada; recuperação de timeout; rejeição 400 e nova tentativa | `billing.test.mjs` |
| Cobrança normal | Após término do contrato legado, novo trial recusado; contrato pago fica pendente até cobrança simulada confirmada | `billing.test.mjs` |
| Alteração/cancelamento | Upgrade espera confirmação; downgrade espera ciclo; cancelar/retomar; webhook repetido e reconciliação delimitada | `billing.test.mjs`; bateria 047 existente |
| Upgrade do banco | Cada uma das três migrations falha propositalmente antes do commit, reverte e depois aplica sobre dados locais existentes | `upgrade.test.mjs` |
| Base extraída | `npm ci`, build/typecheck, suíte 061, navegador 061 e formatação | Logs `*-limpa` no pacote de evidências |
| Gate histórico | Executado, **FAIL**. Continuação diagnóstica separada registra etapas, sem converter falha em PASS | `gate-limpa.log`, `regressao/results.json` |

Os testes de chamadas concorrentes usam a fila transacional do fixture PGlite: comprovam idempotência e rejeição de revisão desatualizada, não substituem ensaio de corrida com múltiplas conexões PostgreSQL reais. Não houve teste de carga, Windows, Search Console, runtime Render adormecido, DNS/HTTPS real ou integração financeira remota.

O navegador verifica foco/teclado e overflow; não houve certificação WCAG ou medição de Core Web Vitals em tráfego real. HTML SSR, imagens limitadas, dimensões reservadas e ausência de scripts externos são medidas implementadas, não resultados de campo inventados.

Os testes históricos foram preservados. A 061 possui manifesto adicional para sua origem oficial; não reescreve expectativas antigas de 051/054/055/060. Incompatibilidades antigas e observações de navegador continuam registradas como falhas, exigindo revisão antes da integração.
