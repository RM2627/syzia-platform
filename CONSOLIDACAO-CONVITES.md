# VIRELOQ — entrega completa consolidada

Data: 19/09/2026.

Este projeto completo já incorpora integralmente a correção de convites e primeiro acesso. **Não é necessário aplicar o patch anterior.** Código, assets, scripts, testes, fixtures, documentação, configurações de exemplo, lockfile e relatórios históricos acompanham a entrega.

## Composição e integridade

Base: última entrega completa `Projeto-Fase-8-Final.zip`, SHA-256 `c857cf7fb6309f2413d2407f0be45d3f5555ad9642afe8680d979b29fa33f789`.

Correção incorporada: `VIRELOQ-Correcao-Convites.zip`, SHA-256 `acd85a4bfedaa6277fe104d073acaef8c37d4cd9e32f96830dd58585f7cb5781`.

Todos os arquivos da entrega base não substituídos pela correção foram preservados byte a byte, exceto `MANIFEST.json`, regenerado para representar o pacote consolidado. Os resultados desta execução estão em diretório próprio, sem sobrescrever evidências históricas.

As migrations **001–025 permanecem byte-identical** em relação à entrega completa. **Não existe migration 026.** A consolidação não adiciona alterações de código além das contidas na correção recém-entregue. O manifesto identifica cada arquivo pelo SHA-256.

## Correção incluída

- Reenvio preserva o convite interno e suas verificações de validade/autorização; usuário Auth existente segue pelo mecanismo de recuperação.
- Erros seguros e mensagens em português distinguem cooldown, limite, falha de envio/recuperação e convite indisponível, revogado ou expirado.
- A tentativa atual limpa mensagens antigas; a interface diferencia falha atual de envio anterior aceito.
- Links Auth inválidos/expirados não apresentam formulário de senha utilizável; callbacks válidos são verificados antes da definição de senha e do aceite.
- Mantidos isolamento, autorização, aceite idempotente, ausência de trial automático e exclusividade server-side da chave privilegiada.

Causas, comportamento, códigos e orientações SMTP permanecem em `docs/vireloq/invitation-recovery-fix.md`. As instruções desse relatório para mesclar o patch são históricas; **neste ZIP a mesclagem já foi realizada**.

## Utilização da entrega

1. Extraia este ZIP em uma nova pasta. O projeto está em `foundation/`.
2. O proprietário copiará manualmente suas configurações locais existentes para essa instalação. Nenhum arquivo preenchido de ambiente foi fornecido, recriado ou inferido nesta tarefa. Incluídos somente `.env.example` e `.env.server.example` do projeto.
3. Na pasta do projeto, execute `npm ci` e `npm run build` com a versão de Node indicada no README.
4. Para continuar a instalação local existente, execute a Platform API com `npm run platform:dev` e o frontend com `npm run dev`, conforme suas configurações locais. Para demonstração fictícia isolada, use `npm run dev:demo`.
5. **Não executar reset nem reaplicar SQL para esta consolidação.** O ambiente informado já possui a migration 025.

Dependências instaláveis são descritas por `package.json` e `package-lock.json`; `node_modules`, build gerado e runtime de navegador não fazem parte do código portátil. Não é necessário obter o ZIP anterior nem o patch para reconstruir o projeto.

## Limites

Validação realizada exclusivamente localmente, com dados fictícios, adapters controlados, SQL/PGlite, navegador e HTTP loopback. Nenhuma operação em Supabase real, SMTP real ou outro serviço do produto foi executada. O sucesso real anterior informado pelo proprietário não substitui a repetição da homologação após esta correção.

Não houve deploy nem alteração de branding ou escopo. **O vídeo permanece CANCELADO.**

## Testes executados após a consolidação

| Grupo | Aprovados |
| --- | ---: |
| Backend/HTTP — adapters controlados | 32 |
| Convites — SQL/PGlite | 12 |
| Fundação — segurança SQL/PGlite | 68 |
| Interface — navegador e Auth controlado | 30 |
| Demo — desktop/mobile, convite, identidade, rascunhos e trial | 6 |
| Proteção da configuração | 3 |
| Demo — smoke HTTP local | 1 |

**152 casos locais aprovados; nenhuma falha.** TypeScript, `npm run build` e inspeção do bundle com marcador server-only também aprovados. A inspeção não encontrou o marcador nem o nome da variável privilegiada no bundle.

Não foi repetida toda a regressão cumulativa das Fases 2–8: esta execução cobre as áreas pertinentes à consolidação e à correção, sem alterações adicionais de código. Relatórios históricos foram preservados. Logs, resultados estruturados e comandos desta execução: `reports/consolidation-invitations/`.
