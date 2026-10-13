# SYZIA 051 — checkout e diagnóstico

Exceção autorizada ao freeze, sobre a 050 consolidada com complemento jurídico. Escopo original integral em `request.md`.

- Diagnóstico e limites: `DIAGNOSTICO-FINANCEIRO.md`.
- Aplicação e rollback: `GUIA-INSTALACAO-E-ROLLBACK.md`.
- Cobertura: `MATRIZ-TESTES.md`.
- Resultado final: `RELATORIO.md` e `RESULTADO-GATE.json` na entrega.
- Integridade: `base-050-sha256.json`, transições exatas em `authorized-hashes.json`, HMAC/snapshot em `security-anchors.json`.

Comandos novos: `npm run test:051` e `npm run test:051:browser`. Gate oficial continua `npm run test:current-gate`, com todas as etapas anteriores.

A 051 não identifica o motivo específico de uma recusa antiga sem evidência, não altera o contrato real, não confirma MP-01, não muda regras financeiras/jurídicas nem autoriza operação real. Sem deploy, push, banco real ou cobrança. Parar após entrega.
