# Atualização sem reset — navegação e onboarding (028)

Esta entrega é o projeto completo. Não aplique o patch de convites separadamente. Nenhuma operação no Supabase real foi executada pelo Work.

## Instalação existente com 001–027 aplicadas

1. Guarde uma cópia da instalação atual e mantenha o procedimento de backup do seu ambiente. Pare os processos locais antes de substituir o código.
2. Extraia `Projeto-Fase-8-Final.zip` em uma nova pasta. O projeto está em `foundation/`.
3. Copie manualmente seus arquivos locais `.env` e `.env.server` da instalação atual para a nova pasta `foundation/` (e `.env.local`, se utilizado). Esses arquivos preenchidos não foram fornecidos ao Work, não estão no ZIP e não foram recriados. Não substitua suas configurações pelos exemplos.
4. Confirme que a 027 já foi aplicada. No SQL Editor do mesmo projeto de homologação, execute **somente** o conteúdo integral de `supabase/migrations/202609200028_company_workspace_authorization.sql`. Não reaplique 001–027, não execute reset, seed ou bootstrap novamente.
5. No terminal, dentro de `foundation/`, execute:

```sh
npm ci
npm run build
```

6. Reinicie os processos locais usados na sua instalação, cada um em seu terminal:

```sh
npm run platform:dev
npm run attachments:dev
npm run dev
```

O segundo comando se aplica quando o gateway de imagens/anexos faz parte da instalação atual. Mantenha suas portas e URLs de ambiente existentes. Não há dependência ou configuração externa nova nesta correção.

7. Atualize a página no navegador e entre com o Super Admin existente. Não crie vínculo empresarial para ele. Execute os cenários do roteiro `external-homologation.md`.

## Se a instalação ainda estiver na 026

Aplique primeiro a 027 seguindo `docs/organization-activation/upgrade.md`; depois aplique a 028 acima. Para uma instalação nova, siga os guias cumulativos com as migrations em ordem. Não use instruções de instalação nova para resetar uma base existente.

## Efeito da 028

A migration atualiza predicados de autorização, nove RPCs existentes e quatro policies SELECT. Não cria tabelas, usuários, memberships, configurações empresariais preenchidas, trial ou aceite legal. Não altera os registros de onboarding. As 27 migrations anteriores continuam idênticas.

O frontend e a 028 devem ser atualizados juntos: só trocar a rota não libera as permissões no banco. Uma empresa suspensa continua sem acesso operacional; o Super Admin pode reativá-la pela Administração VIRELOQ.

Quando uma empresa ainda não tem configurações inicializadas, o checklist abre a configuração existente, onde o botão **Iniciar configuração** prepara os registros vazios. Isso não define administrador nem inicia trial.

Não executar Supabase reset, excluir usuários ou apagar dados para instalar esta correção. O vídeo continua cancelado.
