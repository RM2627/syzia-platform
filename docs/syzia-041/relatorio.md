# SYZIA 041 — relatório técnico de entrega

26/09/2026 · Base exclusiva 040 consolidada · Desenvolvimento e validação locais.

A rodada implementa os três caminhos solicitados: contratação direta, avaliação com horário pretendido e ajuda contextual antes da contratação. Entrega cumulativa completa, com migration incremental 041. Não houve reset, deploy, publicação externa, dados reais, provider de cobrança ou auditoria mestre.

## CORRIGIDO NESTA RODADA

- **Navegação:** uma entrada principal “Equipe SYZIA” para gestão global de pessoas. A antiga operação continua acessível como “Minha operação”, sem perder funções úteis. Atendimento humano e Comercial e retornos permanecem separados.
- **Autoatendimento:** configuração por serviço de contratação imediata ou avaliação. Preços e adicionais determinísticos usam o catálogo publicado; o consumidor escolhe disponibilidade e confirma a reserva na mesma transação do envio. Não há aprovação humana nem proposta final artificial. O pedido direto tem progresso Pedido → Agendamento → Serviço.
- **Avaliação:** horário pretendido escolhido no wizard, visível no pedido e proposta, sem ocupar capacidade. A aprovação tenta reservar com a duração final; um conflito conserva a proposta aprovada e apresenta novas opções imediatamente.
- **Roteamento:** serviço variável, composição que exige avaliação e exceção técnica seguem para atendente próprio elegível; sem ele, ADM elegível. O mesmo ticket guarda motivo e responsável. Se nenhum responsável estiver elegível, permanece na fila da empresa; não é desviado para a SYZIA definir preço. Histórico anterior não é reatribuído em massa.
- **Ajuda:** descrição, FAQ, regras publicadas e respostas rápidas antecedem o contato. A ajuda usa rascunho, cliente, oportunidade e ticket existentes; a retomada mantém o código do pedido e o ponto da jornada. Não cria versão comercial ou appointment para simular contratação.
- **Fotos e perguntas:** política por serviço, instruções, perguntas simples e condicionais. Fotos permanecem nos anexos privados existentes, vinculadas ao serviço. Empresa solicita fotos no acompanhamento e consumidor envia por esse mesmo acesso seguro.
- **Calculadora:** painel e Central usam o mesmo componente. Originais, serviço/adicional real e item complementar específico; quantidade, valor, duração, desconto por item/percentual/valor, subtotal e total. A prévia reutiliza a apresentação do consumidor. Valores indefinidos não são exibidos como orçamento zero.
- **Servidor:** valida autorização, escopo, tipos numéricos, origem do catálogo, duração, revisão, desconto e idempotência. Reduzir o preço fixo no campo unitário também conta para o teto de desconto. Compartilhado não contorna a restrição pelos endpoints antigos de preço arbitrário. RLS acrescenta restrição de leitura para tickets de decisão empresarial e seus registros relacionados.
- **Histórico:** proposta enviada é imutável; revisão cria versão nova. Pedido original, versão recusada/aprovada, ator, valores e auditoria permanecem. Aprovação e reserva não registram pagamento.
- **Experiência:** mantém marca publicada, contraste claro/escuro, resumo com detalhes sob demanda, proposta discriminada, horário confirmado/pretendido, ações permitidas, pedido de fotos e indicador de mensagem nova. Central abre orçamento em área ampla, preservando a conversa e notas internas separadas.

## TESTADO LOCALMENTE

| Validação | Resultado | Evidência |
|---|---:|---|
| SQL 041, inclusive upgrade populado | 35 aprovados | `reports/syzia-041/sql.json` |
| Regressão 038 sobre 041 | 22 aprovados | `regression-038.json` |
| Regressão 039 sobre 041 | 26 aprovados | `regression-039.json` |
| Regressão 040 sobre 041 | 35 aprovados | `regression-040.json` |
| Chromium local, desktop/mobile | 7 aprovados | `browser.json` |
| Total de casos | **125 aprovados, 0 falhas finais** | `validation-summary.json` |
| Typecheck, build e verificação de bundle | Aprovados | `build.log`, `bundle.log` |
| Integridade da base | 37 migrations e 23 assets de marca anteriores idênticos | `base-integrity.json` |
| Upgrade de dados sintéticos | 119 tabelas comparadas, dados e colunas anteriores preservados | `sql.json` |

Os JSON/logs citados sem diretório estão em `reports/syzia-041/`. Matriz detalhada dos 29 requisitos de teste e capturas dos três fluxos: `matrizes.md`. Não foram reexecutadas todas as suítes históricas; a regressão foi limitada aos módulos afetados.

Ambiente: Node 24.19.0, PGlite com fixture de Auth, Chromium local e gateway de anexos da demo com armazenamento local simulado. O navegador percorreu formulários, proposta, aprovação, conversa e upload real via gateway local; isso não equivale a Auth ou Storage externos. O caso de horário ocupado é sequencial, não um teste com duas conexões PostgreSQL concorrentes.

Na regressão 038, o caso de atendimento de composição sob avaliação passou a usar o ADM elegível com presença disponível, substituindo o compartilhado. É a alteração de autoridade exigida pela 041; as asserções de itens, versões e conversa foram mantidas. O adaptador é explícito em `scripts/syzia-041/regression.mjs`; os testes históricos não foram editados.

Durante a implementação, falhas intermediárias de seletores de navegador, comparação de timestamps por texto e preparação de presença/grants foram corrigidas. A revisão visual também corrigiu tokens de cor, seção de fotos indevida em pedidos diretos e total de orçamento com valores ainda indefinidos. Os resultados finais são os dos arquivos desta rodada.

## PENDENTE DE HOMOLOGAÇÃO EXTERNA

1. Validação manual do proprietário dos fluxos A/B/C e aplicação 040→041 em ambiente escolhido por ele, com backup e dados fictícios.
2. Auth real, sessões entre dispositivos, PostgREST, gateway/Storage privados reais e transporte/expiração dos anexos; SMTP continua na homologação separada existente.
3. Concorrência com conexões PostgreSQL/PostgREST independentes, disputa de último horário, desempenho e recuperação de backup.
4. Integrações/provider e pagamentos reais permanecem fora desta rodada e sem validação ou contratação.

O runner nativo foi tentado e encerrou com código 2: o contêiner não permite mapear o usuário não root exigido pelo PostgreSQL. `reports/syzia-041/native.log` registra o bloqueio. Não houve teste PostgreSQL nativo nesta entrega. `npm run test:041:native` está preparado para máquina Linux compatível; não representa sozinho uma suíte completa de concorrência.

## Regras de compatibilidade e limites

- A 040 contém 37 arquivos de migration: rodadas sem alteração de banco não geram arquivo. Todos os 37 foram preservados byte a byte, além da nova 041.
- A migration adiciona metadados e substitui funções/policies afetadas em transação. Nenhum histórico ou dado empresarial é apagado. Não cria memberships, bypass de grants ou credenciais no frontend.
- Configuração nova deve ser revisada e publicada pela empresa. Snapshot publicado anterior não muda com rascunho e não recebe republicação automática.
- Se um serviço variável não tiver duração cadastrada, a consulta preliminar usa o intervalo configurado do recurso apenas para oferecer preferência de horário. A proposta exige duração final positiva; essa duração é revalidada antes da reserva.
- Preservado o limite atual de até 5 imagens JPEG/PNG/WebP por pedido, até 5 MB cada. Não há IA analisando fotos ou decidindo preço.
- As relações de serviços/adicionais, restrições de publicação, agenda, cancelamento e remarcação continuam nos motores existentes.
- Não há decisão de produto pendente identificada que bloqueie a entrega autorizada.

## Entrega e encerramento

`SYZIA-041-Consolidado.zip` contém fonte completo, migrations desde a primeira, assets, lockfile, scripts, testes, demo fictícia, documentação anterior e nova, evidências e `MANIFEST.json` com hashes. O ZIP foi reaberto para verificar CRC e todos os hashes do manifesto. Dependências instaladas, build temporário, credenciais e resultados transitórios do navegador ficam fora do pacote.

Guia aplicável: `guia-upgrade.md`. Inventário: `alteracoes.md` e `alteracoes.json`. **Parar após entrega para homologação manual do proprietário.** Nenhuma próxima rodada, deploy ou publicação automática foi iniciada.
