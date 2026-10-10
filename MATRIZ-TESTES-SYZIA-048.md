# Matriz de testes — SYZIA 048

Ambiente: Node 24, PGlite descartável, transporte/Auth/Storage/Mercado Pago fictícios e Chromium. Nenhuma credencial real. Testes Node focados: `npm run test:048`. O gate os inclui integralmente.

| ID | Cenário e verificação |
|---|---|
| H01 | Um listener/porta; Plataforma, Billing, mídia e health; timeouts; rota desconhecida |
| H02 | CORS exato/preflight, origem indevida, sessão ausente e usuário inválido por módulo |
| H03 | Upload reencodado por Sharp, download público/privado, ticket e código de outro tenant negados |
| H04 | Checkout real do adaptador com provider fictício, duas abas, um POST financeiro, webhook sem Origin e repetido, reconciliação, isolamento A/B |
| H05 | JSON inválido, limites 4/16 KiB, Storage indisponível, erros/logs sem segredos canário |
| H06 | Agendamento serial da reconciliação; parada impede novas rodadas |
| H07 | Shutdown preserva resposta em andamento e fecha listener |
| H08 | Entrada `server/unified.mjs` em processo filho Node único, PORT dinâmico, health e SIGTERM com saída zero |
| H09 | Credenciais ausentes/origem insegura rejeitadas antes do listener |
| M01 | Upgrade 047 populada→048; conteúdo de todas as tabelas e flags RLS/FORCE RLS iguais; negação 047 antes da correção registrada |
| M02 | Sem Manual publicado: página publicada, onboarding mínimo pronto, painel acessível |
| M03 | Manual parcial/rascunho não bloqueia publicação ou autonomia própria |
| M04 | Cadastro e conclusão de provisionamento de funcionário próprio sem Manual |
| M05 | Funcionário com grants assume ticket e responde; mensagem chega ao consumidor |
| M06 | Solicitação, proposta por funcionário, aprovação pelo consumidor e reserva na Agenda sem Manual |
| M07 | Autonomia atual autoriza até o teto; excesso e revogação rejeitados; catálogo reflete teto |
| M08 | Ausência de Manual não concede grants e não permite acesso A/B |
| M09 | Modo misto: shared sem Manual negado, equipe própria permitida; ativação shared rejeitada sem orientação |
| M10 | Manual completo continua habilitando shared; alteração não publicada não amplia sua autonomia |
| M11 | Comercial opera com autonomia e horários da empresa quando não há Manual |
| M12 | Publicação sem dados mínimos continua rejeitada |
| M13 | Nova empresa com zero versões de Manual publica e conclui configuração mínima, após verificação cadastral fictícia pela RPC existente |
| M14 | Proposta da Central própria sem Manual, desconto autorizado e auditoria com manual_id nulo |
| I01 | SHA-256 de todas as 43 migrations anteriores, lockfile e núcleo financeiro 047 |
| B01 | Browser desktop/mobile 1440/390/320: checklist opcional sem incompletude, publicação após prévia, rascunho e módulos operacionais, página pública, ausência de erro JS/overflow |

São 24 testes Node e um cenário de navegador com os três tamanhos de viewport. As asserções incluem resultados positivos e negativos; não contar cada assert como um teste independente.

## Regressões mantidas

O gate de 19 etapas conserva as 17 etapas da 047: 33 testes de billing, contrato do runner, upgrades/funcionalidade 045–046, UX-001, correções 044, regressões 040–042/onboarding, gateways, build/typecheck/segredos e navegadores gerais, Equipe, UX-001, Billing e flexível. Os cenários de trial antigo sem cartão seguem exclusivamente na fixture offline histórica; contratos reais 047 mantêm o teste próprio de meio de pagamento obrigatório.

A única adequação de expectativa de produto nesta rodada está no adaptador `scripts/syzia-044/regression.mjs`: três asserções dos dois cenários antigos de onboarding passaram a exigir item Manual presente/opcional e prontidão compartilhada separada da configuração mínima. Os arquivos históricos permanecem byte a byte, e as negações shared são testadas em M09/M10 e na regressão 045/046. Não houve remoção de cenários para conseguir PASS.

## Resultado e limites

O resultado de cada etapa é registrado em `reports/syzia-044/current-gate.json` após executar o comando. A entrega acompanha `RESULTADO-GATE-048.md` com a validação da extração nova e o SHA-256 do ZIP final. Resultados brutos/screenhots da execução 048 ficam separados em `SYZIA-048-EVIDENCIAS.zip`.

Credenciais reais, Render, Supabase remoto, callbacks Mercado Pago e concorrência PostgreSQL de múltiplas conexões: PENDENTES, descritos em `PENDENCIAS-HOMOLOGACAO-048.md`.
