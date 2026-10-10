# Pendências externas — SYZIA 048

Validação local não equivale a homologação de provedores reais. Nenhuma das ações abaixo foi executada nesta rodada.

| ID | Pendência | Evidência necessária posteriormente |
|---|---|---|
| MP-01 | Mecanismo oficial de notificações reais de Assinaturas, herdado da 047 | Confirmar como registrar callback aplicável a Assinaturas e receber evento em ambiente de teste. `notification_url` continua hipótese documentada na 047; não presumir a configuração geral de Checkout Pro. |
| MP-02–05 | Tokenização/compra teste, ciclo/trial/retentativas, pausa/cancelamento/reativação e mudança de valor | Executar `GUIA-MERCADO-PAGO-TESTE.md` com contas e credenciais de teste do proprietário. Não usar cartão real. |
| DB-048 | Upgrade 047→048 no Supabase/PostgreSQL de homologação populado | Backup, aplicação incremental, comparação de dados e grants, RLS/FORCE RLS, PostgREST/Auth e concorrência real. PGlite não atesta essas integrações. |
| API-048 | Instância Render e balanceador reais | Um processo/porta, bind em PORT, TLS, CORS entre domínios, headers do proxy, rate limits, SIGTERM, carga de uploads e dimensionamento. |
| MEDIA-048 | Supabase Storage real | Upload sanitizado, leitura privada com JWT/sessão/ticket, mídia pública, revogação e isolamento A/B. Transporte local foi simulado. |
| OPS-048 | Operação externa e restauração | Alertas para reconciliação pendente, limites de recursos, indisponibilidade, restauração e procedimentos de incidente. |

Os endereços planejados não foram registrados/configurados nesta entrega. Assistido permanece indisponível para contratação. Mercado Pago continua desativado por padrão. A restauração do feature freeze funcional local, após PASS, não autoriza produção nem encerra MP-01.
