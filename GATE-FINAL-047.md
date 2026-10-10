# Gate final 047 — contrato de entrega

O gate obrigatório é `npm run test:current-gate`, executado depois de `npm ci` e `npm run build` em diretório novo, extraído de `SYZIA-047-BASE-LIMPA-CONSOLIDADA.zip`.

O resultado executado é entregue separadamente em `SYZIA-047-EVIDENCIAS.zip`, arquivo `VALIDACAO-BASE-LIMPA-047.json`, com status de instalação/build/gate, caminho da extração, hash do ZIP, hashes das migrations e logs completos. Este documento não contém resultados brutos nem substitui aquele registro.

O runner possui 17 etapas, interrompe no primeiro erro e retorna não-zero se qualquer etapa falhar. O teste de falha controlada é proposital e só é aprovado quando o runner devolve FAIL/exit 42 para a falha injetada; ele não representa falha do gate final.

Aprovação local não comprova homologação externa. MP-01 de configuração das notificações de Assinaturas permanece PENDENTE, assim como a compra de teste e o upgrade no Supabase real pelo proprietário. Nenhuma ativação de produção foi realizada.
