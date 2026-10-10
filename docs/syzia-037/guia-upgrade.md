# SYZIA 037 — atualização sobre a 036

Esta rodada corrige a apresentação das credenciais após reemissão. **Não há migration nova, reset ou alteração de autenticação.**

## Atualizar

1. Preserve a pasta 036 e suas configurações locais. Extraia o ZIP 037 em outra pasta e abra `foundation`.
2. Copie as configurações locais que utiliza, como `.env.local` e `.env.server`, mantendo os segredos exclusivamente no servidor.
3. Execute `npm ci` e `npm run build`. No PowerShell, use `npm.cmd` se necessário.
4. Encerre o frontend antigo e inicie o da pasta 037 com `npm run dev`. Atualize a página do navegador para carregar a interface nova.

A API de acesso da 036 não mudou. Se preferir executar todos os processos da nova pasta, reinicie também `npm run platform:dev` e `npm run attachments:dev`, cada um em seu terminal. Para quem já aplicou a 036, não executar SQL adicional. Quem ainda estiver em versão anterior deve seguir primeiro o guia da 036.

## Homologar a correção

1. Entre como Super Admin e abra **Administração SYZIA → Pessoas e acessos**.
2. Escolha uma pessoa fictícia em **Aguardando primeiro acesso**, clique em **Abrir ficha** e vá até **Segurança**.
3. Clique em **Gerar novo código de primeiro acesso** e confirme.
4. A tela deve levar automaticamente ao painel **Novo acesso gerado**, com nome, usuário, novo código e novo link. Não deve terminar apenas em “Alteração salva.”.
5. Confira **Copiar instruções de acesso**, **Copiar código** e **Copiar link**, incluindo o feedback de cada botão.
6. O estado deve continuar **Aguardando primeiro acesso**. O par anterior deve ser recusado. Em outra sessão, o novo link deve pedir somente o código temporário e permitir criar a senha.
7. Feche as instruções ou recarregue a página: o segredo não deve reaparecer. Uma nova reemissão deve continuar disponível.
8. Repita no celular e confira que outra pessoa não foi alterada.

Se a reemissão falhar, deve aparecer um erro, sem credenciais novas nem confirmação de sucesso. Não recrie a pessoa para contornar uma falha. Se perder a apresentação após uma emissão bem-sucedida, gere outro par e compartilhe sempre as instruções mais recentes.

## Testes locais

```text
npm run test:037
npm run test:037:browser
npm run build
```

O teste de navegador inicia automaticamente a demo descartável com dados fictícios. Não deixe outros processos usando 5173/54321. Use o Chromium do Playwright configurado no seu ambiente; `FOUNDATION_CHROMIUM_PATH` pode apontar para um executável existente. Esses testes não se conectam ao banco do proprietário.

Após a entrega, aguardar homologação. Este guia não autoriza deploy, reset, produção ou nova fase.
