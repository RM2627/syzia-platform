# SYZIA 047 — Checkout e Assinaturas

## Resultado e limites

Base 046 preservada, com incremento restrito a billing e limpeza do pacote. Implementados backend/adaptador Mercado Pago, migration 047, estados locais, checkout tokenizado, área de assinatura, antifraude de trial, tolerância, cancelamento/reativação, mudança de plano, auditoria e reconciliação. A integração fica desativada por padrão. Sem deploy, credenciais reais, cobranças, novos preços, Assistido comercial ou reabertura de UX-002.

Os 33 testes Node específicos passaram no desenvolvimento local; o navegador validou o fluxo e retomada após recusa. A entrega inclui execução novamente a partir de extração limpa. O resultado definitivo, contagens e logs estão em `GATE-FINAL-047.md` e no ZIP separado de evidências; não confundir ensaios anteriores com o gate da base entregue.

**MP-01 permanece aberto:** a documentação oficial exclui a configuração geral de Webhooks para Assinaturas, mas não esclarece `notification_url` na referência de POST `/preapproval`. Receptor e reconciliação estão implementados; o mecanismo que efetivamente habilita a entrega de notificações precisa de confirmação oficial/homologação posterior. Essa pendência impede declarar a integração externa integralmente homologada ou restabelecer o freeze sob a condição “tudo passou”. Não foi ocultada por um teste mock.

## Antes × depois

| Tema na base 046 | Resultado na 047 |
|---|---|
| Provider comercial ainda sem integração MP efetiva | Adaptador server-side separado, transport injetável, endpoints e testes offline |
| Trial antigo podia ser concluído sem meio de pagamento | Runtime real cria empresa pendente; somente MP autorizado com método vinculado inicia trial |
| Retorno de checkout não tinha ciclo MP completo | Retorno mostra confirmação; servidor consulta recurso e confere vínculos |
| Sem ledger dedicado de recorrência MP | Contrato, comandos, reservas, pagamentos e auditoria privados, com RLS/FORCE RLS |
| Sem tratamento completo de perda de resposta MP | Operação incerta não repete POST; busca por referência recupera assinatura |
| Sem tolerância MP específica | Três dias desde vencimento; retentativas somente do provider; recuperação automática |
| Cancelamento e mudança sem política MP implementada | Pausa confirmada + acesso remanescente; troca no ciclo seguinte condicionada à confirmação financeira |
| Pacote acumulava resultados históricos | Mais de seis mil arquivos históricos retirados; testes/fixtures/migrations mantidos |

## Correções encontradas durante os testes

- Condição SQL nula poderia tratar reserva sem provider como novo contrato; a reutilização passou a ser explícita.
- Leitura concorrente poderia sobrescrever intenção de cancelamento; lease e preparação impedem a disputa.
- UI poderia anunciar cancelamento apenas solicitado; agora exige confirmação consultada no provider.
- Recusa definitiva versus perda de resposta têm recuperação distinta; nunca se repete criação de resultado incerto.
- Retomar após recusa/reload preserva a oferta e a expectativa de trial; UI reapresenta R$0 somente quando a reserva ainda corresponde ao benefício.
- Downgrade revalida membros também na confirmação financeira e não remove vínculos.
- Notificação tardia de contrato substituído preserva somente sua auditoria/histórico privado; não sobrescreve a projeção pública da assinatura vigente. A regressão foi reproduzida na versão anterior da 047 e corrigida antes da entrega.

## Política financeira e autorização

Essencial R$49,90, Profissional R$89,90 e Equipe R$149,90 mensais, BRL. Sete dias oficiais para elegíveis com cartão desde o início. Planos MP com/sem trial são variantes técnicas das mesmas três ofertas. Não há pró-rata inventado, créditos ou cobranças avulsas. Trocas passam a valer após a próxima recorrência confirmada no novo valor; a versão local continua sendo autoridade de capabilities.

O código não migra automaticamente assinaturas legadas ativas nem decisões administrativas. Mantém isenções/homologações/suspensões existentes e nega nova contratação paralela. Nenhuma matrícula/equipe é excluída para acomodar limites.

## Evidência e rastreabilidade

- `MATRIZ-TESTES-BILLING-047.md`: cobertura e pendências externas.
- `docs/billing-047/ESTADOS-E-POLITICAS.md`: transições, prazo, trial, idempotência e cancelamento.
- `INVENTARIO-ALTERACOES-047.md`: arquivos alterados/novos e limpeza.
- `GUIA-UPGRADE-047.md`: instalação, banco populado, serviços e cron.
- `GUIA-MERCADO-PAGO-TESTE.md`: configuração futura e homologação, com MP-01 explicitado.

As 42 migrations históricas existentes foram comparadas por SHA-256; a 047 é o 43º arquivo da cadeia preservada, sem inventar migrations ausentes ou renumerar. Lockfile, código de testes históricos e assets reais foram preservados. O ambiente local usa PGlite; Supabase real, credenciais, SDK remoto e ciclo financeiro real não foram executados.
