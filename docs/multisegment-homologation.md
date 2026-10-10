# Versatilidade — validação externa preparada, não executada

Repetir somente quando houver autorização para ambiente dedicado. Não criar módulos por segmento nem usar dados reais. Guias de Auth, Storage, publicação, isolamento e concorrência anteriores continuam aplicáveis.

- A: empresa automotiva fictícia com formato antes/depois, orçamento e agenda.
- B: designer fictício com uma imagem em galeria, serviços fixos/a partir de/sob consulta, perguntas sobre ambiente e orçamento.
- C: nutricionista fictícia sem portfólio/capa, consulta de preço fixo e modalidade presencial/online; solicitação, agenda e acompanhamento administrativo somente.

Configurar manualmente esses dados pelas telas existentes no ambiente dedicado. `tests/fixtures/multisegment.mjs` é exclusiva de PGlite descartável e deve recusar banco externo. Não adaptar esse seed para importar dados reais.

Verificar em sessão anônima a projeção pública, em sessão consumidora isolada a solicitação/agenda, e como gestores separados a configuração/publicação. Confirmar que rascunhos não vazam, formatos do portfólio funcionam, ausência de portfólio não bloqueia prontidão, imagem privada exige autorização e nenhum conteúdo interno/registro de outro tenant aparece. Repetir upload/tipos/limites, JWT revogado, publicação concorrente, agenda concorrente e telas em dispositivos reais conforme os guias cumulativos.

A configuração de perguntas e notas livres não é um filtro clínico. O uso deste produto nesse cenário é exclusivamente administrativo; não coletar informações clínicas. Não há certificação clínica ou afirmação de conformidade regulatória específica nesta revisão.

Registrar ambiente, casos, resultados e pendências. Nenhum teste local constitui homologação externa. Não fazer deploy de produção para executar esta validação.
