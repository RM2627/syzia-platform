# SYZIA 034 — guia de atualização e homologação local

## Base e instalação

Use o pacote consolidado 034 sobre a base funcional 033. Faça backup da instalação e preserve suas configurações locais fora do pacote. Não substitua segredos por exemplos.

- Node/npm conforme README da base; instalar com `npm ci`.
- Manter `.env.local`/`.env.server` configurados no ambiente autorizado pelo proprietário.
- Banco já atualizado até migration 033: **nenhuma migration nova nesta rodada**.
- Não resetar banco nem reaplicar migrations 001–033. Não abrir bucket nem alterar policies/grants.
- Esta entrega não executa deploy e não inicia produção.

## Processos da homologação local

Abra **três terminais** na pasta `foundation`, cada um mantido em execução:

| Terminal | Comando | Papel | Endereço usual |
|---|---|---|---|
| 1 | `npm run dev` | Interface | `http://127.0.0.1:5173` |
| 2 | `npm run platform:dev` | Login, provisionamento e ações de acesso | `http://127.0.0.1:8788` |
| 3 | `npm run attachments:dev` | Gateway privado de imagens | `http://127.0.0.1:8787` |

No Windows/PowerShell, use `npm.cmd` se necessário. Confirme no terceiro terminal: `Private media gateway on loopback. External homologation pending.`

A URL pública `VITE_ATTACHMENT_GATEWAY_URL` deve apontar para o gateway; `CONSUMER_ORIGIN` deve coincidir exatamente com a origem da interface, incluindo protocolo/host/porta. `VITE_PLATFORM_API_URL` e `PLATFORM_APP_ORIGIN` cumprem os mesmos papéis para a API de acesso. `localhost` e `127.0.0.1` são origens diferentes. Não coloque chaves privilegiadas em variáveis `VITE_*`.

Execute `npm run diagnose:034` (ou `npm.cmd run diagnose:034`). O diagnóstico consulta somente `/health` em loopback, não imprime segredos e informa processo pronto, gateway indisponível, origem negada ou resposta inesperada. Um processo pronto não prova conexão externa com Auth/Storage.

Gateway parado: inicie o terceiro terminal e repita o envio. A mensagem de interface informa indisponibilidade do gateway e preserva a imagem anterior/rascunho. O caso relatado na 033 foi resolvido iniciando esse processo; não deve ser atribuído automaticamente ao Storage.

A demo descartável continua separada: `npm run dev:demo` agrega interface e mocks locais. Não use a demo como servidor de homologação real. Pare-a antes de iniciar os três processos acima. Não é necessário SMTP para a entrega manual de credenciais.

## Percurso de credenciais

1. Em Pessoas e acessos, crie uma pessoa sem empresa. Após concluir, confira nome, usuário, código e link.
2. Teste Copiar instruções de acesso, Copiar código e Copiar link. Compartilhe apenas com a pessoa correta pelo canal escolhido.
3. Abra o link em outra sessão: usuário/contexto preenchidos, código temporário solicitado; defina senha pessoal.
4. Após uso, o código anterior deve ser recusado. Fechar/recarregar a tela do operador não recupera o texto puro.
5. Se perdido/expirado, use **Gerar novo código de primeiro acesso** na ficha/lista correspondente. O novo invalida o anterior.
6. Em falha de Auth/finalização, use **Retomar provisionamento**. Só depois da conclusão são exibidas instruções válidas. Não repita a criação com outro nome para contornar uma reserva.
7. Repita em Pessoas e acessos da empresa com um administrador autorizado. Verifique outro tenant com usuário empresarial: sem acesso adicional.

A redefinição de acesso ativo continua revogando sessões segundo a regra existente; não é recuperação de um código antigo.

## Percurso de mídia

1. Envie logos horizontal, quadrada e vertical; confira lettering inteiro na prévia e na página publicada, inclusive celular.
2. Para capa, use 4:3 (recomendado 1600×1200), depois uma foto fora da proporção. Ambas devem ser aceitas dentro dos limites.
3. Em **Ajustar enquadramento**, arraste, ajuste zoom/posição, centralize, cancele e salve. No celular, confira o gesto e os sliders.
4. Salve identidade visual, revise a prévia e publique. Recarregue editor e página pública. Antes de publicar, a versão anterior continua pública.
5. Repita em imagem de serviço (3:2; recomendado 1200×800), salvando o serviço e publicando pelo fluxo existente.
6. Portfólio: foto única inteira; antes/depois com duas áreas equivalentes; galeria com miniaturas e ampliação completa. Use fotos comparáveis para antes/depois.
7. Pare o gateway e tente trocar uma imagem: mensagem específica e referência anterior preservada. Reinicie e repita.

O recorte salvo é uma nova imagem sanitizada. Para recuperar áreas fora dele, envie o original novamente. Não há migration de enquadramento.

## Percurso da landing

Confira desktop, tablet e celular; hero preservado, recursos, jornada diária, equipe, página pública, financeiro, controle, FAQ e CTAs. Verifique navegação por teclado. Planos e avaliação refletem as ofertas publicadas; sem oferta, a página deve mostrar estado vazio adequado. Contato registra interesse; cadastro self-service segue o fluxo existente. Não usar valores da demo como oferta real.

## Comandos de validação local

```bash
npm run test:034
npm run test:034:browser
npm run build
npm run diagnose:034
```

Playwright usa seu navegador Chromium instalado. Neste ambiente de desenvolvimento foi usado `FOUNDATION_CHROMIUM_PATH` apontando para o executável local; ele não faz parte do pacote. Relatórios e capturas efetivamente executados estão em `reports/syzia-034/`.

## Pendências externas e parada

Supabase/Auth/PostgREST/Storage reais, políticas no ambiente do proprietário, rede/CORS reais, concorrência, browser móvel físico e eventual SMTP opcional requerem homologação separada. Os testes incluídos usam PGlite e Auth/Storage locais simulados. Não processam cobrança ou envio real.

**Entrega concluída para avaliação do proprietário. Parar aqui: sem nova fase, publicação, reset ou produção.**
