# SYZIA 067 — E-mails e temas da Academy

Base: `RM2627/syzia-platform`, commit `0a3acbe3bd0c62cec2db259d6c5a35aa4b4342d7`. A referência da main foi consultada pelo GitHub conectado; os 1.319 arquivos da cópia-base conferem com os objetos Git desse commit. Trabalho em cópia isolada, sem commit, push, merge ou alterações externas.

## Resultado

Implementados diagnóstico sanitizado dos e-mails, isolamento de falhas da fila, teste administrativo com prévia/confirmação e temas claro/escuro exclusivos da Academy. A validação local passou. **A causa do incidente SMTP real ainda não foi comprovada, e a entrega real pelo Resend permanece pendente.**

## E-mails: o que foi comprovado

- Demo e Academy usam `createAccessMailer`, as mesmas credenciais, opções SMTP/TLS, timeouts e a mesma imagem PNG embutida por CID. A composição MIME das duas mensagens passou no transporte simulado. Não há evidência para atribuir o incidente ao anexo ou à autenticação.
- O diagnóstico anterior reduzia DNS, conexão e timeout ao mesmo `email_temporary_failure`. Não guardava a etapa nem a resposta SMTP estruturada. O novo diagnóstico conserva apenas enums, código SMTP numérico permitido, ID interno e duração. Nunca conserva resposta bruta, comando AUTH, destinatário completo, senha ou conteúdo da mensagem nos logs.
- No Nodemailer 10.0.10, `ETIMEDOUT` com `command=CONN` também pode ocorrer durante a transmissão. Esse par sozinho permanece **incerto**. Somente os erros iniciais exatos `Connection timeout` / `Greeting never received` comprovam falha antes do envio. DNS, autenticação e respostas negativas explícitas recebem classificações próprias.
- Foi corrigida uma falha adicional da fila: uma exceção ao persistir o resultado de uma mensagem interrompia o processamento das seguintes. Agora a tentativa permanece protegida contra reenvio, gera aviso sanitizado e o processamento de mensagens independentes continua. Falha ao obter o próximo item ainda interrompe essa execução com diagnóstico seguro.
- A fila continua reivindicando apenas itens pendentes. Não há reenvio automático de resultados incertos nem reclassificação retroativa dos resultados existentes.

| Resultado novo | Tratamento |
| --- | --- |
| Aceito pelo SMTP | `accepted`; não comprova caixa de entrada ou leitura |
| Configuração, autenticação ou rejeição definitiva | `failed`, categoria `definitive`, etapa específica |
| DNS, timeout comprovadamente inicial, resposta negativa 4xx | `failed`, categoria `temporary` |
| Timeout/socket sem prova da etapa, aceitação desconhecida | `uncertain`; verificar no provedor antes de qualquer nova tentativa |
| Limite administrativo/local | Operação bloqueada, `academy_rate_limited`, sem envio |

Um 4xx genérico não comprova sozinho limite de quota do Resend. Mantemos seu código numérico e a classificação temporária, sem inventar uma causa específica.

## Teste administrativo

Comunicações → **Testar envio de e-mail**. Exclusivo do Super Admin ativo, com a mesma proteção de sessão existente. Destinatário explícito e declaração de autorização → prévia da mensagem fixa → confirmação → resultado.

Prévia expira em 10 minutos; até 20 prévias/hora, 3 envios autorizados por administrador/hora e 10 no total/24h. Limites e reivindicação persistem no banco, incluindo concorrência entre processos. Confirmação repetida usa a mesma tentativa. Resultados incertos não são repetidos. A ação não cria inscrições, não processa a fila de confirmação e não dispara campanhas. O destinatário fica criptografado apenas durante a preparação/tentativa; o payload é removido ao finalizar ou expirar. O histórico de testes conserva IDs e diagnóstico sanitizado, com limpeza de registros concluídos após 180 dias ao abrir a visão administrativa.

A migration **202610310067_academy_mail_diagnostics.sql** é necessária para persistir diagnóstico, prévias, limites, idempotência e auditoria do teste. Acrescenta uma coluna e uma tabela da Academy e RPCs restritas; preserva RLS/FORCE RLS, os controles de sessão e as funções existentes. Foi executada somente no banco local descartável dos testes. As **62 migrations históricas permanecem byte a byte intactas**.

## Tema público

Controle acessível de sol/lua no cabeçalho. Usa inicialmente o sistema, acompanha mudanças até uma escolha manual e persiste em `localStorage["syzia.academy.theme"]`. Não usa Supabase, conta ou configuração do SaaS. Script próprio no início do HTML aplica o tema antes do React, compatível com a CSP atual. O teste atrasou o módulo React para verificar o fundo inicial.

A paleta clara original permanece. A paleta escura cobre apresentação, formulários, mensagens, catálogo, módulos, aulas, materiais, progresso, navegação e rodapé. Usa as logos oficiais existentes, sem redesenho. O contêiner e o estado inicial do player acompanham o tema; a interface interna do YouTube pertence ao fornecedor e não é reestilizada. Não foi realizada reprodução remota de vídeo.

## Validação executada — separada por melhoria

| Conjunto | Resultado |
| --- | --- |
| Transporte/MIME/erros/idempotência e compatibilidade Demo | 13 PASS |
| Fila, SQL local, RLS, permissões, limites, concorrência e preservação histórica | 10 PASS, incluindo subtestes |
| HTTP/runtime real com cliente Supabase e SMTP simulados | 1 PASS |
| Inicialização dos temas, escolha local, armazenamento indisponível e isolamento | 7 PASS |
| Navegador Chromium: temas, navegação, formulário, aula/progresso e teste administrativo | 10 verificações PASS; nenhum erro JavaScript |
| `npm run build` | PASS, incluindo TypeScript |
| `npm run academy:build` | PASS, incluindo TypeScript |

Total: **31 testes Node e 10 verificações de navegador**. Node 24.22.1, Vite 8.3.4, Chromium headless/Linux; dados fictícios, PostgreSQL local via PGlite, SMTP/storage simulados. Os testes reaproveitam a cadeia SQL necessária como fixture; não executam gates históricos. A concorrência de chamadas foi exercitada com a serialização do fixture local e reivindicação SQL; não é uma homologação de múltiplas instâncias do Supabase remoto.

Desktop 1440 px e celular 390/360 px; sem overflow, teclado/foco e revisão visual das capturas locais. Sete combinações de texto/fundo escuro medidas: mínimo **5,28:1**, acima de 4,5:1. Isso não equivale a certificação integral WCAG. Paleta clara comparada aos valores originais. Os primeiros ensaios ajustaram somente expectativas/fixtures novos (código de validação existente, capa obrigatória, título exato e espera do checkbox assíncrono); nenhum teste histórico foi enfraquecido.

## Pendências e limites

- Homologação SMTP/Resend real, DNS/TLS e entrega na caixa do destinatário: **não executados**. Seguir o guia; nenhum e-mail real foi enviado nesta execução.
- Render documenta bloqueio de saída SMTP 25/465/587 em instâncias Free. É uma hipótese **condicionada à confirmação do plano da instância atual**; não explica automaticamente o incidente, especialmente considerando os envios anteriores da Demo. Não alteramos infraestrutura nem portas sem comprovação. O transporte compartilhado atual aceita apenas 465/587; trocar sozinho para 2587 não resolve, pois será recusado por sua validação.
- Regressão geral, serviços reais e Windows: não executados nesta rodada restrita. Convites Demo, Auth, billing, Insights, cursos e dados operacionais não tiveram sua lógica alterada. Inventário verifica os arquivos preservados; não se declara homologação integral desses módulos.

## Referências técnicas oficiais consultadas em 31/10/2026

- [Resend SMTP: TLS, portas, idempotência e visualização de envios](https://resend.com/docs/send-with-smtp).
- [Resend: idempotência por 24 horas](https://resend.com/docs/dashboard/emails/idempotency-keys). O bloqueio local de repetição não depende apenas dessa janela.
- [Nodemailer: erros](https://nodemailer.com/errors) e [SMTP](https://nodemailer.com/smtp); comportamento de timeout conferido também no código da versão instalada.
- [Render Free: limitações de rede](https://render.com/docs/free).

A fonte específica do incidente anterior continua desconhecida. Esta entrega fornece diagnóstico verificável para a próxima tentativa autorizada e corrige o isolamento da fila sem inventar sucesso de entrega.
