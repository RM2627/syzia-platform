# Demonstração do acesso empresarial

Execute `npm ci` e `npm run dev:demo`; abra `http://127.0.0.1:5173/entrar`. Tudo é local, fictício e descartado ao parar. Não é Auth nem Storage real, nunca publicar este servidor.

| Empresa/cenário | Código | Usuário |
|---|---|---|
| MS Auto Details fictícia, completa | A1B2C3D4E5F6 | marina.costa |
| Estúdio Horizonte fictício | B1B2C3D4E5F6 | lia.horizonte |
| Nutricionista fictícia | C1B2C3D4E5F6 | clara.nutri |
| Ateliê Inicial, onboarding | D1B2C3D4E5F6 | gestor.novo |
| Atendente próprio de A | A1B2C3D4E5F6 | equipe.propria |

Senha de todas as contas fictícias iniciais: `FictitiousPassword123!`. Novas contas usam a senha escolhida na ativação.

Super Admin: na mesma tela, **Acesso da operação VIRELOQ**, e-mail `root@example.invalid`, mesma senha fictícia. Operadores compartilhados usam `agenta@example.invalid`, `backup@example.invalid`, `agentb@example.invalid` ou `shared@example.invalid`, conforme permissões da massa existente.

Jornada: Super Admin → Empresas → nome/slug → nome e sobrenome do primeiro administrador → confirmar username/e-mail de contato → Criar e ativar empresa. Copie as instruções exibidas uma vez. Abra outro perfil/janela privada em `/ativar-acesso`; informe empresa/usuário/código temporário; escolha e confirme a senha; revise e aceite as minutas; abra a empresa e seu onboarding. Em Pessoas e acessos, crie um colaborador sem e-mail e repita em outro perfil. Em Redefinir acesso, um novo código invalida o antigo e encerra autorizações anteriores.

A troca de senha é simulada somente pelo adapter descartável da demo; produção usa Supabase Auth. Recomeçar o processo restaura dados fictícios. O reset de limites por teste só existe quando `DEMO_TEST_MODE=true`, definido pela configuração Playwright; o demo normal e a Platform API não oferecem esse reset. Rate limits do produto não foram reduzidos.

Página pública continua `/empresa/ms-auto-ficticia`; B `/empresa/horizonte-ficticio`. A marca da organização continua protagonista. Nenhum cadastro real é necessário.
