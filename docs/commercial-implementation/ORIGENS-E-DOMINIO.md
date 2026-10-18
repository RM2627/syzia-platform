# Origem e isolamento das demonstrações

Endereço planejado: `https://demo.usesyzia.com.br/:slug`. Não houve consulta de disponibilidade, DNS, certificado ou publicação. O domínio não é fallback de desenvolvimento.

| Superfície | Desenvolvimento configurável | Futuro planejado |
|---|---|---|
| Aplicação administrativa | `http://127.0.0.1:5173` | `https://app.usesyzia.com.br` |
| Demonstração | `http://127.0.0.1:5174` | `https://demo.usesyzia.com.br` |
| API unificada | `http://127.0.0.1:10000` | `https://api.usesyzia.com.br` |

`COMMERCIAL_DEMO_ORIGIN` e `PLATFORM_APP_ORIGIN` são obrigatórias e diferentes quando o módulo está habilitado. Só HTTPS ou HTTP em loopback; origem não aceita credenciais, caminho, query ou fragmento. CORS usa igualdade exata, sem wildcard ou cookies compartilhados.

O build demonstrativo é `demo.html`/`dist-demo`. Reutiliza os módulos reais com transporte de RPC exclusivo. A sessão opaca vai em Authorization e fica em sessionStorage da origem demonstrativa; não é JWT de produção. A aplicação operacional não aceita essa sessão. O segredo recebido no fragmento é retirado da barra de endereço. Uma nova empresa solicitada invalida a sessão anterior do visitante nesta aba.

Rotas da API existente: `/commercial/*` para ações autenticadas de gestão e ativação; `/demonstrations/*` para sessões limitadas; `/demonstration-media/*` reutiliza o gateway e o sanitizador originais. A consulta de convite e o descadastramento aceitam somente a origem da aplicação. As outras rotas demonstrativas aceitam somente a origem demonstrativa.

A API revalida versão, validade, revogação e, no editor, autorização do operador. Não basta reconhecer o host ou conhecer um UUID. Toda chamada passa por lista de RPCs e pelo escopo da organização; o SQL original continua validando papel, grants, plano, disponibilidade e vínculo.

As origens futuras deverão ser configuradas pelo proprietário em rodada autorizada. A hospedagem estática da demo precisará devolver o `index.html` demonstrativo para suas rotas internas. O backend permanece um processo/porta HTTP; o banco demonstrativo é uma dependência separada, não outro servidor da plataforma.
