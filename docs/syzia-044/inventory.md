# Inventário 044

Nenhum arquivo da base removido. O JSON associado lista todas as adições.

## Arquivos existentes alterados

| Arquivo | Finalidade |
|---|---|
| `AGENTS.md` | Registrar autorização e parada 044 |
| `README.md` | Entrada atual da entrega e gate |
| `package.json` | Comandos 044/current-gate |
| `scripts/dev-consumer-demo.mjs` | Carregar migration 044 no runtime local de testes |
| `src/api.ts` | Causas específicas de aprovação, duração e ordem |
| `src/consumer/api.ts` | Aprovação explícita na mensagem de reserva |
| `src/operations/Operations.tsx` | Separar serviço/buffer/janela e orientar remarcação |
| `MANIFEST.json` | Integridade da entrega consolidada |

## Adições

- Uma migration transacional 044; cinco helpers privados e guarda de gravação.
- Gate oficial, adaptadores explícitos, testes focados/upgrade/UI e fixtures atuais.
- Escopo, guia, relatórios por achado, mapa histórico, matriz obrigatória e evidências.
- Manifesto 042 preservado separadamente; manifestos históricos de testes/migrations/reports para o gate.

Todos os testes, migrations e reports históricos originais constam do manifesto protegido e passaram pela conferência byte a byte. Assets/marca, lockfile e demais módulos da base não foram alterados.
