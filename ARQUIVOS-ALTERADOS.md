# Inventário de alterações e integridade

Comparação byte a byte contra o ZIP 044 anexado. Nenhum arquivo original ausente. As 40 migrations, os testes históricos e os relatórios históricos permanecem intactos. Lockfile/package e código do servidor não foram alterados. A árvore `src/` entregue é idêntica à utilizada no gate cumulativo final.

| Arquivo original alterado | Motivo |
|---|---|
| `AGENTS.md` | Registra os limites e a parada desta rodada. |
| `README.md` | Aponta para os documentos e evidências atuais. |
| `src/FoundationApp.tsx` | Suspense local, escopo do provedor e feedback/lock de abertura. |
| `src/api.ts` | Mensagem neutra para erros não classificados. |
| `src/billing/Billing.tsx` | Uma consulta de capacidades, vinculada à empresa. |
| `src/billing/Capabilities.tsx` | Reuso opcional do snapshot autorizado da assinatura. |
| `src/central/Central.tsx` | Leituras pós-comando independentes em paralelo. |
| `src/company/Categories.tsx` | Reutiliza categorias do contexto e aguarda refresh após salvar. |
| `src/company/Company.tsx` | Remove dependência de seção na consulta; fornece categorias existentes. |
| `src/consumer/CompanyMedia.tsx` | Deduplicação somente em voo e prévia vinculada ao arquivo/escopo. |
| `src/consumer/CompanyPage.tsx` | Prévia com lote limitado de quatro imagens e limpeza em falha. |
| `src/consumer/PortfolioEditor.tsx` | Passa escopo da empresa às imagens privadas. |
| `src/consumer/PresenceAdmin.tsx` | Consulta presença e categorias em paralelo. |
| `src/operations/Onboarding.tsx` | Um effect de consulta por navegação. |
| `src/ui/design-system.css` | Área local de carregamento com altura mínima. |

O `MANIFEST.json` é regenerado no empacotamento e não inclui seu próprio hash. Sua versão original está em `reports/ux-performance/base-MANIFEST.json`.

## Arquivos novos de implementação/teste

- `src/consumer/company-image-request.ts`: compartilhamento de downloads somente enquanto pendentes, por escopo autorizado.
- `tests/ux-performance-media.test.mjs`: concorrência no mesmo escopo, isolamento entre escopos/sessões e retry após negação.
- `scripts/ux-performance/`: runner local, medidor de produção, ações, guardas, verificação e geração da matriz.
- `docs/usability-performance/request.md`: especificação integral fornecida nesta rodada.

## Documentos e evidências

Relatório, matriz, lista UX, guia e este inventário na raiz. `reports/ux-performance/` contém logs, JSONs, capturas, traces, a execução inicial com falha e a execução final PASS. O inventário detalhado de cada arquivo novo está em `reports/ux-performance/integrity.json`; o manifesto `MANIFEST.json` cobre os arquivos do pacote, exceto o próprio manifesto.

Foram alterados 16 arquivos existentes (13 de fontes/estilos, 2 de documentação e o manifesto regenerado). Não há migration nova. O ZIP inclui todos os arquivos originais, inclusive os exemplos de ambiente e histórico. Exclui dependências instaladas, builds temporários, caches e resultados temporários do Playwright; as evidências finais selecionadas estão em `reports/ux-performance/`.
