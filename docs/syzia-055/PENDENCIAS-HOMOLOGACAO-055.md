# SYZIA 055 — pendências para homologação do proprietário

As validações locais não autorizam produção. Nenhuma ação externa abaixo foi executada.

| Pendência | O que confirmar | Condição |
|---|---|---|
| MP-01 e assinatura real | Entrega de notificações de Assinaturas, HMAC, consulta oficial, reconciliação e confirmação do contrato | Homologação externa autorizada, sem inferir aprovação a partir dos mocks |
| Auth e sessão reforçada | JWT original, renovação, revogação e editor entre origens | Ambiente isolado com origens/CSP exatas |
| Neon/PostgreSQL | Upgrade populado, locks, múltiplas conexões e limites de capacidade | Banco exclusivo de homologação; PGlite não comprova concorrência nativa |
| Storage | Upload sanitizado, promoção por hash, namespace e políticas reais | Storage isolado, sem dados de clientes |
| E-mail | Identidade do remetente, entregabilidade, descadastramento e limites | Infraestrutura autorizada; nesta execução, somente transporte simulado |
| Windows | Repetir build/gate e conferir o guia PowerShell | LF/CRLF cobertos localmente, sem execução Windows nesta rodada |
| Retenção e carga | Definir prazo/rotação do histórico demonstrativo e mídias congeladas; ensaio de carga | Nenhum expurgo destrutivo automático criado; capacidade acumulada bloqueia novos acessos quando atingida |
| Revisão visual | Conferir as capturas e reproduzir a experiência completa na base entregue | Aprovação do proprietário, especialmente editor e página pública |
| Destino já editado | Rever configurações quando houver commercial_destination_changed | Não há override que apague alterações do responsável |

O build passou com aviso do Vite para chunks maiores que 500 kB minificados (render: 1.135,27 kB; gzip: 506,86 kB). Não foram alterados limites ou dependências para ocultar esse aviso. O impacto de carga real precisa ser medido antes de produção.

O arquivamento permanece como estado compatível, sem nova ação de interface. A expiração é aplicada por data, independentemente do rótulo. A organização operacional materializada continua sujeita à publicação normal da página pelo responsável.

Somente após a homologação e uma nova autorização: planejar a integração, backup, migrations nos destinos corretos, configuração de origens e eventual publicação. Não executar esses passos por consequência automática desta entrega.
