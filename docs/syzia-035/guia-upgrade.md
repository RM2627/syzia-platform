# SYZIA 035 — atualização sobre a 034

## Atualizar os arquivos

1. Preserve sua pasta 034 e as configurações locais. Extraia o novo ZIP em uma pasta separada e abra a pasta `foundation`.
2. Copie para ela os arquivos locais de configuração que você já usa, como `.env.local` e `.env.server`. Não envie suas chaves para o navegador nem substitua seus valores pelos exemplos.
3. Execute `npm ci` (ou `npm.cmd ci` no PowerShell).
4. Execute `npm run build`.
5. **Não execute migration 035: ela não existe e não é necessária.** Quem já está na 034 com migrations 001–033 aplicadas não precisa alterar o banco.

Não é necessário recriar empresas, pessoas ou preparações pendentes. Não resetar o banco.

## Reiniciar os processos corretos

Encerre os processos da pasta antiga. Abra três terminais na nova pasta `foundation`:

```text
Terminal 1: npm run dev
Terminal 2: npm run platform:dev
Terminal 3: npm run attachments:dev
```

No Windows, use `npm.cmd` se o PowerShell impedir `npm`.

**Reiniciar a Platform API é indispensável:** a correção da credencial interna está no servidor. Atualizar apenas a página do navegador mantém o backend antigo em execução.

`npm run diagnose:035` reutiliza o diagnóstico local da 034 e verifica os processos/origens configurados. Esse comando não valida o Auth ou o Storage externos.

## Retomar a preparação existente

1. Entre novamente com o Super Admin.
2. Abra **Administração SYZIA → Pessoas e acessos → Preparações pendentes**.
3. Na pessoa já reservada, clique em **Retomar provisionamento**.
4. Confira nome e username. Depois da conclusão, copie as instruções, o código ou o link pelo botão correspondente.
5. Envie pelo canal que escolher. SMTP automático continua opcional.
6. Em outra sessão do navegador, o titular usa o código e define sua própria senha. O código deve deixar de funcionar após o uso.

Não crie outra pessoa para contornar uma preparação pendente. Se o acesso já foi concluído e você perdeu as instruções, utilize a ação existente para gerar novo código de primeiro acesso.

Se aparecer **“Sua sessão expirou ou foi encerrada”**, clique em **Entrar novamente**, autentique-se e volte à mesma preparação. Isso é separado da falha de provisionamento Auth.

## Se o provider ainda recusar

Consulte o evento seguro no terminal da Platform API. Para relatar o problema, bastam `request_id`, `code`, `stage`, `category`, `status` e `reason`.

| Motivo seguro | O que verificar |
|---|---|
| `validation_failed` / `weak_password` | Confirme que a API foi reiniciada com a 035; confira a política do projeto e o evento correspondente no painel Auth. |
| `bad_jwt` / `not_admin` ou categoria `auth_credentials` | Confira URL do projeto e credencial exclusivamente server-side. Não copie essa chave para variáveis `VITE_`. |
| `email_exists` / `user_already_exists` / conflito de identidade | Preserve a reserva. Compare o evento Auth com o identificador da requisição antes de qualquer intervenção manual. |
| `over_request_rate_limit` / HTTP 429 | Aguarde o limite do provider e retome a mesma preparação. |
| HTTP 5xx / `auth_provider_unclassified` | Consulte o evento do provider: o SDK pode não fornecer um código estruturado. Não presumir causa só pelo HTTP. |
| `session_expired` | Reautentique o operador e retome o mesmo cadastro. |

Não compartilhar senhas, código temporário completo, tokens, chave server-side ou resposta bruta do provider. Esta entrega não diagnosticou suas credenciais reais nem acessou seu projeto Supabase.

## Homologar demonstração e capa

- Para a demonstração descartável, use `npm run dev:demo` em lugar dos três processos acima; não use as mesmas portas simultaneamente. Abra `/empresa/horizonte-ficticio`. Deve aparecer **Estúdio Horizonte**, com um único aviso “Exemplo de página criada com a SYZIA”. A demo continua usando dados de exemplo.
- Na empresa de homologação, abra **Página da empresa → Identidade visual → Capa da página**. A recomendação é 4:3, por exemplo 1600 × 1200 px.
- Envie uma imagem válida, use **Ajustar enquadramento**, mova/arraste e altere o zoom. Salve o enquadramento e depois **Salvar identidade visual**.
- Recarregue, abra **Visualizar como cliente** e confira. **Publicar alterações** atualiza a página dessa empresa no ambiente em que você estiver homologando; a prévia é fechada após publicar.
- Confira o resultado em desktop e celular. Logo, serviços e portfólio mantêm suas proporções próprias.

Não é necessário recortar novamente uma capa 4:3 já aprovada. Para recuperar uma área removida por um recorte anterior, reenvie a imagem original; essa é a regra existente da 034.

## Reproduzir a validação local

```text
npm run test:035
npm run test:035:browser
npm run build
npm run check:bundle
```

Os testes de navegador precisam do Chromium do Playwright, conforme a instalação já documentada no projeto. Os testes SQL normais usam banco descartável em memória, não seu banco de homologação. Não apontar fixtures para um banco real.

Foram aprovados 79 casos únicos. A execução com PostgreSQL nativo foi bloqueada pelo contêiner; Auth/Storage e concorrência reais continuam pendentes de homologação. Não houve deploy nesta rodada. Após sua avaliação, registrar o resultado antes de autorizar outra rodada.
