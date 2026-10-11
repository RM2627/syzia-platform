# SYZIA 049 — Instalação por sobreposição

Base obrigatória: 048 consolidada. O ZIP é uma base completa limpa, com caminhos relativos à raiz de `foundation`, sem pasta `foundation/` externa. Extraia **dentro da sua pasta foundation existente**, substituindo arquivos de mesmo nome. Não é necessário apagar a pasta.

## Antes de atualizar

- Faça uma cópia local da base e backup operacional do banco por sua rotina. Não envie segredos ou dump para o Work/Git.
- Preserve `.env`, `.env.server`, `.env.server.backup`, credenciais e `syzia-plan-mapping.local.json`. O ZIP não contém esses arquivos e não os sobrescreve. Apenas `.env.example` e `.env.server.example` são distribuídos como referência sem segredo.
- Nenhum arquivo de código da 048 precisa ser removido. Não executar `git clean -fdx`, resetar banco ou apagar migrations. Artefatos antigos locais podem permanecer; não são dependências do pacote.

## Validação local

Na pasta `foundation`, com Node compatível (usado nesta rodada: Node 24.19.0) e npm:

```sh
npm ci
npm run build
npm run test:049
npm run test:049:browser
npm run test:current-gate
npm run homologation:billing:isolated -- --offline
```

O gate prepara Chromium Linux quando disponível no pacote opcional. Em Windows/macOS, instalar Chromium com `npx playwright install chromium` ou definir `FOUNDATION_CHROMIUM_PATH`. Build já inclui `tsc --noEmit`. Não iniciar dois gates/browser demos simultaneamente nas mesmas portas locais 5173/54321. Os testes não exigem seu `.env.server` nem o banco real; usam dados fictícios locais.

## Banco

Preservar a cadeia completa 001–048 byte a byte. Aplicar apenas `supabase/migrations/202610110049_customer_operation.sql` sobre banco 048 populado, por procedimento controlado do proprietário, primeiro em ambiente separado. Ela começa com `begin` e termina com `commit`; não interromper e continuar trechos isolados. Não usar baseline, reset ou reaplicar migrations já registradas. Há alterações de funções e tabelas privadas, uma coluna em appointments e backfill da sequência auxiliar das mensagens; planejar janela conforme volume. Confirmar sucesso integral antes de usar a interface 049.

O Work não aplicou SQL no Supabase real. A compatibilidade foi testada sobre fixture populada local com comparação dos dados e RLS/FORCE RLS pré-existentes.

## Servidor e frontend

Entrada única preservada: `npm start` → `server/unified.mjs`, uma porta `PORT`, três módulos no mesmo Node. Arquivos locais de ambiente continuam sob sua administração. Rebuild necessário por novas dependências PDF e assets de fonte. O domínio em uso informado é `https://usesyzia.com.br` e API `https://api.usesyzia.com.br`; os endereços planejados em guias antigos são históricos. Conferir origens reais e callbacks no seu ambiente, sem copiar cegamente exemplos antigos.

Não há variável nova que ative automaticamente homologação. Billing do Render permanece desativado. Ler o relatório financeiro antes de preparar testes externos; não recriar os seis planos ou repetir `configure-plans --apply-test` no banco de lançamento.

## Rollback e atualização remota futura

Guardar a 048 antes da sobreposição. Em falha de código, restaurar arquivos/lockfile da cópia e refazer `npm ci`/build. Não apagar tabelas/colunas 049 nem histórico para voltar versão; a 048 não usa as novas tabelas. O endpoint de cadastro 048 não emite nonce: não manter o hook 049 ativo com esse endpoint antigo. Preferir correção progressiva e controlar o cadastro durante a reversão; não remover a segurança como solução.

Publicação futura é ação exclusiva do proprietário: revisar diff e segredos, versionar em GitHub sabendo que push pode disparar deploy, atualizar backend/Cloudflare na ordem compatível com migration e conferir smoke tests/health. Nada disso foi executado pelo Work. Não ativar Mercado Pago em produção até encerrar MP-01 e demais critérios externos.
