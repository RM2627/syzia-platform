# Aplicação e rollback — complemento jurídico SYZIA 050

## 1. Instalar o complemento localmente

Base obrigatória: SYZIA 050 com hotfix financeiro e HMAC MP-01 já integrados. Faça uma cópia da base e confira o inventário antes da sobreposição. Extraia o ZIP na raiz que contém `package.json`. Ele substitui somente os arquivos do inventário; não contém migrations, dependências, builds ou acervo de evidências. Os textos-base 050 acompanham o complemento como cópias idênticas para consulta.

Execute no diretório novo:

```bash
npm ci
npm run test:legal:050
npm run test:hotfix:050:legal
npm run test:legal:050:browser
npm run build
npm run test:current-gate
```

O navegador usa Chromium. O gate prepara o runtime já previsto no projeto; para rodar o teste isolado antes do gate, configure `FOUNDATION_CHROMIUM_PATH` com um Chromium disponível. Os testes usam somente fixtures locais. Para concorrência PostgreSQL real em Linux compatível, execute `npm run test:legal:050:native` como usuário comum; ele cria e remove um cluster temporário com socket Unix e TCP desabilitado. Retorno 2 significa bloqueio ambiental, não PASS. Não apontar testes para Supabase ou banco existente.

## 2. Conferir o estado jurídico — proprietário, posteriormente

Nada desta seção foi executado no Supabase real. Utilize o editor SQL autenticado como proprietário do banco, não o navegador da aplicação ou uma chave no frontend.

Execute integralmente `scripts/legal-050/01-CONSULTAR.sql`. É uma transação somente leitura. Salve **o objeto JSON da coluna `legal_snapshot`**, sem envolver em lista, em um arquivo `snapshot.json` privado, fora do repositório. O retorno inclui o par vigente com identificadores, grupos de aceite e hashes; contrato das funções; contagens de aceites e de empresas com/sem exigência; e RLS/FORCE RLS. Não exporta identidades dos usuários que aceitaram.

Confirme exatamente duas versões vigentes, uma `terms` e uma `privacy`, e as contagens/escopo esperados. Não adivinhe que o banco ainda usa `draft-2026-09-19`: versões reais podem diferir. Se houver desvio de contrato, política ou histórico inesperado, interrompa a publicação e investigue; não ajuste hashes apenas para eliminar o erro.

## 3. Preparar identificação e contatos privadamente

Crie uma pasta privada **fora de qualquer checkout Git**, de `public/`, backups versionados ou pastas sincronizadas publicamente. Copie `docs/legal-050/config.example.json` para `config.json` nessa pasta. O exemplo não contém dados pessoais nem informações fictícias de identificação.

Preencha nome público aprovado e canais reais, monitorados, de atendimento e privacidade. Um endereço profissional só deve entrar se válido, necessário e autorizado pelo proprietário (`professional_address_approved=true`). O formato não oferece campo para CPF; não reutilize outro campo para inseri-lo. Não coloque endereço residencial. Resolva as decisões de `DADOS-JURIDICOS-PENDENTES.md` antes de considerar o texto publicável.

Confirme identificadores novos e nunca usados: `version` para os textos e `acceptance_version` para a revisão material. O exemplo sugere `2026-10-13-050` e `material-050-2026-10-13`; se a preparação ocorrer em outra data ou esses IDs existirem, escolha novos identificadores. Não reutilizar grupo anterior, pois esta revisão não é meramente editorial.

## 4. Gerar e revisar — ainda sem SQL de publicação

Exemplo de comando com caminhos privados escolhidos pelo proprietário:

```bash
npm run legal:prepare -- preview /caminho-privado/config.json /caminho-privado/snapshot.json /caminho-privado/revisao
```

O diretório de saída não pode existir; o diretório pai deve existir. O comando gera `TERMOS.md`, `PRIVACIDADE.md` e `REVISAO-PARA-APROVACAO.json`; imprime somente estado e SHA-256. Não envia nada. Os documentos têm a redação-base revisada e a identificação/contatos fornecidos. Não são publicados nem carregados pelo frontend automaticamente.

Revise integralmente os dois textos e seus dados públicos. Alterações no texto-base, identidade, versão ou snapshot mudam o hash. Não acrescente informações internas de testes, infraestrutura ou integrações aos documentos. A opção “preview” não certifica que as informações sejam completas para publicação.

Depois de resolver as pendências jurídicas e factuais, registre as confirmações em `publication_review`: aprovação do proprietário, avaliação da identificação resolvida, informações obrigatórias completas, nenhuma divulgação pessoal pendente, fatos confirmados e referência privada da avaliação. O gerador não dispensa obrigações legais por meio desses campos. Se qualquer requisito depender de decisão ainda não tomada, mantenha falso e não prossiga.

## 5. Gerar o par de scripts, sem executá-los

```bash
npm run legal:prepare -- compile /caminho-privado/config.json /caminho-privado/snapshot.json /caminho-privado/aplicacao SHA256_DA_REVISAO
```

Use o hash real da revisão, não a palavra ilustrativa acima. A saída deve ir para outro diretório inexistente. Divergência do hash ou confirmação pendente impede a geração. O comando produz novamente os textos para conferência e `APLICAR.sql`/`ROLLBACK.sql`. Arquivos são privados por padrão e não são sobrescritos. Não comitar a configuração preenchida, saída ou parecer privado.

Confira que os textos gerados são os aprovados. Mantenha o hash, snapshot e scripts em arquivo administrativo privado. Ao executar posteriormente `APLICAR.sql`, os corpos aprovados passam a ser públicos no banco: não é possível prometer segredo de um dado inserido em documento público. As versões anteriores também continuam consultáveis conforme a política existente; esta tarefa não apaga histórico público.

## 6. Publicação futura pelo proprietário

Planeje uma janela curta. Execute **o arquivo inteiro**, como proprietário e fora de transação já aberta, no editor SQL. Nunca selecione só `UPDATE`, só `INSERT` ou apenas parte do bloco. Em `psql`, use `-v ON_ERROR_STOP=1 -f APLICAR.sql` com a conexão administrada pelo proprietário; não incluir credenciais no arquivo/comando versionado.

A transação READ COMMITTED obtém a mesma trava de aceite (`734921501`), trava a tabela contra outros escritores, verifica contrato/RLS/trigger e confere versões e hashes esperados. Só então desmarca o par anterior e insere os dois documentos novos, publicados, com novo grupo de aceite. As duas mudanças ficam visíveis juntas no COMMIT. Consultas públicas continuam possíveis. Um aceite concorrente aguarda; ao retomar, a RPC existente confere a versão vigente.

Espera de lock: até 5 segundos. Tempo de comando: 30 segundos. Falha aborta a transação; execute `ROLLBACK;` na mesma sessão se o editor permanecer com transação abortada. Não remova locks/validações para forçar execução. Repetição é recusada sem efeitos; não existe upsert que substitua silenciosamente texto. Em resultado incerto, consulte novamente antes de qualquer nova tentativa.

Após sucesso, repita a inspeção e confira os novos IDs. Abra `/termos` e `/privacidade`, confira versão e texto; teste uma empresa de homologação adequada, preservando os dados reais. Empresas sujeitas ao mecanismo verão a exigência de novo aceite pelo administrador quando consultarem a sessão. A tela recusa uma versão desatualizada, oferece recarregar e limpa as marcações de aceite. Cada registro conserva identidade, empresa, horário, versão do texto e grupo aceito.

## 7. Rollback conservador

**Antes de qualquer novo aceite:** executar integralmente `ROLLBACK.sql`, com os mesmos cuidados transacionais. Ele exige que o par novo ainda seja o vigente, que o anterior conserve o mesmo conteúdo e que não exista aceite de nenhum dos documentos/grupos novos. Apenas inverte `current`. Não remove as novas versões, as antigas ou qualquer aceite. Uma nova tentativa de publicação depois do rollback requer IDs inéditos; não editar ou reaproveitar uma versão já gravada.

**Depois de novo aceite:** o rollback recusa com `legal_rollback_has_acceptances`. Não apagar aceites, não alterar o trigger e não reativar versões manualmente para contornar. Preparar uma versão corretiva, com revisão/aprovação apropriadas, preservando o contrato já aceito. O histórico fica íntegro.

**Se já houver outra publicação mais recente:** o rollback também recusa. Reavalie o estado atual. Nunca substituir uma revisão posterior desconhecida.

**Rollback dos arquivos locais:** restaure os arquivos anteriores a partir da cópia da base, conforme inventário. Isso não reverte publicação no banco; não confundir os dois procedimentos. Se documentos novos já estiverem vigentes, o mecanismo anterior ainda usa a mesma tabela/RPC, mas perde a melhoria de recarga da tela e a exibição literal do histórico.

## 8. Encerramento

Não há execução automática, migration nova, deploy, push, cobrança ou alteração de credenciais. O hotfix financeiro e HMAC são preservados. MP-01 segue pendente e não é reaberta por este complemento. Publicação externa e aprovação jurídica continuam a cargo do proprietário.
