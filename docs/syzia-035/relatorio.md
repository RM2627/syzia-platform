# SYZIA 035 — relatório pós-homologação da 034

Entrega local em 25/09/2026. Base exclusiva: ZIP 034 corrigido, com seus 1.486 arquivos conferidos contra o manifesto antes das alterações. Escopo: demonstração, capa 4:3 e provisionamento Auth. Sem deploy, produção, reset ou auditoria mestre.

## Demonstração

O nome empresarial agora é **Estúdio Horizonte**. A página exibe uma única identificação: **“Exemplo de página criada com a SYZIA”**. Foram removidas as explicações de desenvolvimento da descrição, endereço e portfólio dessa empresa demonstrativa. Os dados e as imagens continuam sendo exemplos; a página usa o mesmo componente das empresas reais. Rotas e identificadores existentes foram preservados.

Evidências: `reports/syzia-035/demo-1440.png` e `demo-390.png`.

## Capa 4:3

A 034 já tinha janela de enquadramento, recorte e publicação em 4:3. Essa implementação foi preservada. O upload agora informa explicitamente **“Proporção recomendada: 4:3”**, com sugestão de 1600 × 1200 px.

Foram testadas imagens 1200 × 900, 1600 × 600 e 600 × 1200: mover, zoom, salvar, recarregar e publicar. O arquivo recortado tem a mesma assinatura SHA-256 na configuração, na prévia e na página publicada. As dimensões renderizadas foram verificadas em desktop e celular, sem alteração arbitrária de posição. O editor usa um único retângulo de origem para a prévia e a exportação, mantendo a proporção da imagem.

O enquadramento continua persistido como uma nova variante de imagem pelo gateway privado existente. Sem nova tabela, campo ou migration. Logo, serviço 3:2 e portfólio mantiveram suas regras e passaram pela regressão.

## Causa identificada no provisionamento

Na 034, `createUser` recebia `proof() + proof()`: duas strings base64url de 32 bytes aleatórios, com **86 bytes ASCII** no total. A implementação oficial do Supabase Auth rejeita senhas acima do limite do bcrypt, de **72 bytes**, retornando HTTP 400 com `validation_failed`. A lista local de códigos permitidos não incluía esse motivo, transformando-o em `auth_provider_unclassified`.

A nova credencial interna usa **68 bytes ASCII**, com 384 bits aleatórios e garantia das quatro classes de caracteres. Ela não é o código temporário nem a senha definitiva do titular; não é devolvida ao navegador ou registrada nos logs.

Evidência local: teste de contrato com o SDK Supabase real sobre HTTP em loopback reproduziu a rejeição da credencial legada e a aceitação da nova. O servidor de Auth desse teste é simulado conforme a regra do provider. **O projeto Supabase do proprietário não foi acessado.** A causa determinística presente no código foi identificada e corrigida; a confirmação do resultado no ambiente que gerou os logs permanece para homologação. Os logs anteriores, isoladamente, não identificam todos os possíveis erros daquele ambiente.

Referências oficiais consultadas:

- [Criação administrativa e tratamento de senha longa](https://github.com/supabase/auth/blob/master/internal/api/admin.go).
- [Validação de senha](https://github.com/supabase/auth/blob/master/internal/api/password.go).
- [Códigos de erro do Supabase Auth](https://supabase.com/docs/guides/auth/debugging/error-codes).

## Diagnóstico, retomada e entrega de credenciais

O diagnóstico reconhece códigos seguros como `validation_failed`, `weak_password`, conflitos de identidade, restrições do provider, sessão, credenciais e limite de requisições. Valores desconhecidos continuam sanitizados. Logs mantêm somente identificador da requisição, etapa, categoria, status e motivo permitido. A mensagem e a resposta bruta do provider nunca são copiadas para o log ou a interface. Em HTTP 5xx, o SDK pode descartar o código estruturado; nesse caso o status/categoria são preservados, sem inferir um motivo.

“Pessoas e acessos” passou a usar as mensagens próprias do fluxo de acesso. A falha de provisionamento orienta retomar a preparação, em vez de alegar genericamente falha de conexão. A retomada reutiliza a reserva e o identificador Auth existentes; não altera username, empresa, trial ou vínculos. A recuperação após criação concorrente também confere o identificador retornado.

Somente após a finalização válida são apresentados username, código temporário, link e os três botões de cópia aprovados na 034. O envio continua manual, sem depender de SMTP. Primeiro acesso, senha definitiva e invalidação do código passaram pela regressão.

## Sessão expirada

Criação e retomada consultam a RPC existente `access_session` antes de tocar o Auth, sem renovar artificialmente a atividade. Os testes com RPCs reais em PGlite confirmaram bloqueio por inatividade e revogação. Após registrar uma nova sessão, a mesma reserva pôde ser concluída.

Erros reconhecidos de sessão do SDK recebem tratamento próprio. A tela orienta entrar novamente e oferece esse caminho. Nenhuma validação de sessão, RLS, grant ou autorização foi relaxada.

## Validação executada

| Grupo | Aprovados | Evidência |
|---|---:|---|
| Servidor 035, SDK/HTTP local e erros sanitizados | 17 | `reports/syzia-035/server-tests.txt` |
| Sessão real nas RPCs e preservação da reserva | 4 | `reports/syzia-035/sql-session.json` |
| Regressão SQL 034, uso único e isolamento A/B | 8 | `reports/syzia-035/sql-regression.txt` |
| Regressão de servidor, mídia e utilitários | 42 | `reports/syzia-035/regression-tests.txt` |
| Navegador Chromium, demo, capa e acesso | 8 | `reports/syzia-035/browser-final.json` |
| **Total de casos únicos** | **79** | Sem somar reexecuções |

Build/typecheck e inspeção do bundle para configuração privilegiada: **PASS**. As telas de demonstração e o editor móvel foram inspecionados visualmente.

Os testes de navegador foram ajustados à rota existente `/admin/equipe`, ao preenchimento obrigatório de e-mail e ao fechamento da prévia após publicar. Os sete casos aprovados da execução completa e a reexecução aprovada do caso restante estão consolidados em `browser-final.json`; as saídas originais foram mantidas. O teste HTTP passou a emitir o cabeçalho de versão utilizado pelo SDK para reconhecer os códigos do provider.

## Preservação e limites

**Nenhuma migration nova.** Migrations 001–033, lockfile, regras RLS, grants, Storage e assets da marca foram comparados com a base. O inventário registra os arquivos alterados e as verificações de integridade. Relatórios históricos da 034 foram preservados; a evidência de sua reexecução está na pasta da 035.

A concorrência passou no adaptador HTTP local. O PostgreSQL nativo não pôde iniciar porque o contêiner não permite mapear o usuário necessário: `reports/syzia-035/native-concurrency.txt`. Isso não equivale a concorrência homologada em Supabase/PostgreSQL real.

Auth, Storage, credenciais do projeto e concorrência externa permanecem sob homologação do proprietário. Não houve envio real, cobrança ou integração externa. Entrega encerrada; aguardar homologação.
