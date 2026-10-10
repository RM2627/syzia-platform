# SYZIA 042 — evidências da interface

Capturas feitas na aplicação atual em Chromium local, com React e RPCs da fixture PGlite. Todos os nomes e dados são fictícios. A marca e os assets anteriores foram preservados. Estes arquivos não constituem homologação externa.

As capturas estão em `reports/syzia-042/`. No pacote separado de evidências, estão ao lado do índice HTML, com o mesmo nome.

| Arquivo | Cena e verificação |
|---|---|
| `home-desktop.png` | Trabalho de hoje, atenção, amanhã e ações existentes em desktop. |
| `home-mobile.png` | Home em viewport móvel, com conteúdo e ações acessíveis. |
| `home-erro-local.png` | Erro localizado em um bloco, mantendo os demais; falha injetada pelo teste. |
| `equipe-compartilhada.png` | Identidade compartilhada separada, ações locais e funcionários próprios preservados. |
| `continuo-sem-janela.png` | Duração 6h30, motivo de não caber no expediente e busca compatível. |
| `divisivel-revisao-mobile.png` | Revisão móvel do plano de 10h em dois períodos. |
| `divisivel-acompanhamento.png` | Consumidor acompanha as partes como um atendimento. |
| `divisivel-ficha.png` | Ficha empresarial, períodos vinculados e ações no mesmo contexto. |
| `proposta-validacao.png` | Explicação obrigatória, motivo do CTA bloqueado e duração final. |
| `proposta-aprovada-agenda.png` | Proposta aprovada conservada, horário pretendido e orientação atual de Agenda. |

Os cenários de indisponibilidade, aprovação, reserva e agrupamento usam respostas do SQL local. Erros de transporte/autorização e estado vazio da Home são interceptados de modo controlado para verificar o comportamento de UI. O arquivo `tests/demo-browser/syzia-042.spec.ts` distingue essas situações.

As capturas são evidências pontuais, não cobertura completa de todos os estados. O resultado de sete testes de navegador está em `browser.json`; as verificações de autorização, rollback e história estão em `sql.json` e nas regressões, relacionadas em `cobertura-testes.md`.
