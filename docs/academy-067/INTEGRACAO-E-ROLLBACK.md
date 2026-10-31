# SYZIA 067 — Aplicação, validação e rollback

Pacote incremental para o commit `0a3acbe3bd0c62cec2db259d6c5a35aa4b4342d7`. Não inclui `node_modules`, builds, credenciais ou bases completas. `arquivos/` contém somente arquivos novos/modificados; `SYZIA-067.patch` aplica o mesmo resultado. Use **uma** dessas formas; o patch permite conferir conflitos antes de gravar.

## Aplicação local pelo PowerShell

Abra o terminal na raiz da cópia oficial. Preserve alterações locais antes de continuar.

```powershell
git status --short
git rev-parse HEAD
# Esperado: 0a3acbe3bd0c62cec2db259d6c5a35aa4b4342d7
Expand-Archive -LiteralPath .\SYZIA-067-INCREMENTAL.zip -DestinationPath ..\SYZIA-067-PACOTE
git switch -c syzia-067-academy
git apply --check ..\SYZIA-067-PACOTE\SYZIA-067.patch
git apply ..\SYZIA-067-PACOTE\SYZIA-067.patch
```

Se a base tiver evoluído ou `--check` falhar, preserve as mudanças e compare os arquivos do inventário. Não force a aplicação nem substitua hashes históricos. Nenhum manifesto histórico foi alterado pela 067.

## Validação local direcionada

Use as dependências do lockfile existente; nenhuma dependência foi acrescentada. Em uma extração nova, execute `npm ci` primeiro.

```powershell
node --test --test-concurrency=1 tests/academy-067/mail.test.mjs tests/academy-067/queue-admin.test.mjs tests/academy-067/runtime.test.mjs
node --test tests/academy-067/theme.test.mjs
node tests/academy-067/browser.mjs
npm run build
npm run academy:build
```

O teste de navegador inicia e encerra seu próprio servidor local na porta 5197. Deixe essa porta livre. Bloqueia requisições para origens externas, utiliza banco descartável e SMTP simulado. Não forneça segredos reais a esses testes. As capturas e resultados são reproduzidos em `reports/academy-067/`. Não são arquivos de implantação.

Os dois builds produzem saídas diferentes: `dist/` para a plataforma e `dist-academy/` para a Academy. O segundo inclui `academy-theme.js`, as duas logos existentes e os headers da Academy. Não use o build da plataforma como substituto do build público da Academy.

## Banco e ordem de integração futura

Esta execução **não aplicou SQL remoto nem publicou código**. A migration 067 deve ser revisada pelo proprietário e aplicada uma única vez, após backup e autorização, antes de disponibilizar o backend/admin 067. Ela depende da 066 já instalada.

Arquivo: `supabase/migrations/202610310067_academy_mail_diagnostics.sql`.

A operação é transacional e aditiva: diagnóstico nullable em `academy.deliveries`, tabela privada `academy.mail_tests`, validador e RPCs `academy_mail_admin` / `academy_mail_service`. Não altera conteúdo, estado ou aceites históricos. Não muda `academy_service`, `academy_admin`, `academy.allowed()` ou as regras de Auth. Não reaplique migrations anteriores. Backend e painel devem ser atualizados de maneira coordenada com o esquema; sem a 067 as novas RPCs não existirão.

O modo escuro não precisa de banco nem novas variáveis. Nenhuma credencial ou configuração financeira precisa ser alterada.

## Homologação SMTP posterior pelo proprietário

1. Confira no Render, sem copiar valores secretos para logs, se a instância atual é Free ou paga, se usa o transporte esperado e se host/porta/remetente correspondem à configuração autorizada. Confirme no Resend o domínio verificado. Sucesso anterior da Demo não comprova conectividade da tentativa atual.
2. Entre como Super Admin ativo. Abra Academy → Comunicações → Testar envio de e-mail.
3. Informe um endereço controlado por você ou autorizado pelo destinatário, marque a declaração e abra a prévia. Até aqui não há envio.
4. Confira destinatário, assunto e mensagem. Confirme **uma** tentativa e use Atualizar resultados. Registre ID interno, horário, etapa, código SMTP e classificação; não copie corpo bruto de erro nem credenciais.
5. Compare com a lista de e-mails do Resend e confira caixa de entrada/spam no destinatário. `accepted` significa aceitação SMTP, não confirmação de entrega. O mesmo identificador é usado no header de idempotência `commercial/<id>`.
6. Se houver DNS/conexão/saudação, verifique conectividade e a política de rede da hospedagem. Se autenticação, confira a configuração existente e a validade no provedor sem expor ou trocar a chave por tentativa. Se rejeição de remetente/destinatário, examine o código seguro e o remetente autorizado. Um 4xx não identifica sozinho quota. Use o painel/suporte do Resend para confirmar limites ou regras adicionais.
7. Se incerto, não tente reenviar automaticamente nem marque o envio como falha/sucesso por SQL. Verifique no provedor antes de autorizar qualquer nova mensagem. A 067 não reenvia os resultados históricos incertos da lista de espera.
8. Após confirmar o transporte, a homologação de uma inscrição real será uma ação separada do proprietário; o teste administrativo não inscreve ninguém nem dispara lançamento.

Limites do teste: prévia 10 minutos; 20 prévias/hora; 3 confirmações por administrador/hora; 10 no total/24h. Aceitos, falhos e incertos contam como tentativas autorizadas. Pending não enviado expira, sem repetição automática. O envelope criptografado é eliminado ao finalizar/expirar. Os limites de confirmações e campanhas já existentes permanecem separados e preservados.

Se a instância for Free, a documentação atual do Render informa bloqueio SMTP 25/465/587. O código compartilhado atual aceita somente 465/587. **Não basta mudar para 2587:** suporte a porta alternativa ou outro transporte requer uma alteração dirigida e homologada. Nenhuma mudança desse tipo foi feita por hipótese nesta entrega. Não desligue TLS ou validação de certificados.

## Rollback local

Antes de desfazer, preserve modificações posteriores e aguarde as tentativas de e-mail em andamento. Em seguida:

```powershell
git apply --reverse --check ..\SYZIA-067-PACOTE\SYZIA-067.patch
git apply --reverse ..\SYZIA-067-PACOTE\SYZIA-067.patch
npm run build
npm run academy:build
```

O rollback do código não exige apagar dados da 067: a 066 ignora a coluna/tabela/RPCs adicionais. **Não remova tabela, coluna ou eventos para reverter o frontend/backend.** Conserve resultados e histórico para análise. Nenhum teste pending será reenviado pela 066, que não conhece essa fila. Se necessário, suspenda novas operações enquanto houver diagnóstico pendente; não redefina status no banco.

A preferência de tema usa somente uma chave local exclusiva da Academy; com código anterior ela é ignorada. Não afeta contas ou outros módulos.
