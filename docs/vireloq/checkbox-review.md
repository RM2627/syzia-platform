# Ajuste das caixas de seleção — 18/09/2026

Solicitação: corrigir tamanho excessivo e posicionamento da opção de convite em Empresas.

Causa: estilo global de campos (`input`) aplicava largura 100%, padding e altura mínima de 46px também aos checkboxes. Alguns módulos corrigiam somente parte dessas propriedades.

Alterações de apresentação:
- `src/style.css`: campos checkbox/radio excluídos da regra de dimensionamento de campos de texto.
- `src/ui/design-system.css`: no painel, controles de seleção de 18×18px, cor da identidade, alinhamento à esquerda do texto e rótulo clicável com altura mínima de 44px. Controles nativos, foco e teclado preservados.
- `src/FoundationApp.tsx`: opção de convite movida para dentro do formulário, após os dados da empresa e imediatamente antes dos dados do administrador. Sem mudança de comportamento, autorização ou payload.

Validação LOCAL desta correção:
- Build e TypeScript: PASS (`reports/checkbox-build.log`).
- Fundação: 14/14 casos PASS (`reports/checkbox-foundation-results.json`).
- Trial e convites na demo fictícia, incluindo desktop/mobile: 4/4 PASS (`reports/checkbox-demo-results.json`).
- Inspeção visual: desktop 1440px e mobile 390px; controle 18×18px, rótulo mínimo 44px, clique no texto e tecla Espaço funcionando, sem transbordamento horizontal (`reports/checkbox-visual.json`, capturas em `reports/checkbox/`).
- Todas as 25 migrations comparadas byte a byte com o ZIP anterior: nenhuma alteração. Nenhuma migration nova.

A suíte completa de 641 casos da entrega anterior não foi repetida nesta correção visual; seus registros permanecem como histórico. Não houve alteração de banco, autenticação, regras de trial, integração financeira, serviços externos ou deploy. Homologação externa continua pendente e vídeo continua cancelado.

Entrega: projeto completo cumulativo com MANIFEST atualizado e integridade verificada.
