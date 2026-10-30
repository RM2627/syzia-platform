import { useEffect, useRef, useState } from "react";
import { IMPORT_BYTES, importArticles, parseArticles, previewArticles, type EditorialCall, type ImportResult, type ImportRow } from "./article-import";

export function ArticleImporter({ call, onClose, onImported, onBusy }: {
  call: EditorialCall; onClose: () => void; onImported: () => Promise<void>; onBusy: (busy: boolean) => void;
}) {
  const [rows, setRows] = useState<ImportRow[]>([]), [selected, setSelected] = useState(new Set<number>());
  const [phase, setPhase] = useState<"file" | "preview" | "confirm" | "running" | "done">("file");
  const [loading, setLoading] = useState(false), [message, setMessage] = useState("");
  const [results, setResults] = useState<ImportResult[]>([]), [done, setDone] = useState(0);
  const locked = useRef(false), input = useRef<HTMLInputElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const busy = loading || phase === "running";
  useEffect(() => { input.current?.focus(); }, []);
  useEffect(() => {
    const guard = (event: BeforeUnloadEvent) => { if (locked.current) { event.preventDefault(); event.returnValue = ""; } };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, []);
  async function read(file?: File) {
    if (!file || locked.current) return;
    locked.current = true; setLoading(true); onBusy(true); setMessage(""); setRows([]); setResults([]); setSelected(new Set()); setPhase("file");
    try {
      if (!/\.json$/i.test(file.name) || file.size > IMPORT_BYTES) throw Error("Selecione um arquivo .json de até 1 MB.");
      const local = parseArticles(await file.text());
      let checked: ImportRow[];
      try { checked = await previewArticles(local, call); }
      catch { throw Error("Não foi possível conferir os artigos com o servidor. Verifique sua sessão e a conexão. Nenhum artigo foi importado."); }
      setRows(checked); setSelected(new Set(checked.filter(r => !r.errors.length && !r.duplicate).map(r => r.index))); setPhase("preview");
    } catch (error) { setMessage(error instanceof Error ? error.message : "Não foi possível ler o arquivo."); }
    finally { locked.current = false; setLoading(false); onBusy(false); }
  }
  async function start() {
    if (locked.current || phase !== "confirm" || !selected.size) return;
    locked.current = true; onBusy(true); setPhase("running"); setMessage(""); setDone(0);
    try {
      const outcome = await importArticles(rows, selected, call, setDone);
      setResults(outcome);
      if (outcome.some(r => r.status === "created" || r.status === "uncertain")) {
        try { await onImported(); } catch { setMessage("O resultado está abaixo, mas a lista de artigos não pôde ser atualizada. Recarregue a página para conferi-la."); }
      }
    } finally { locked.current = false; onBusy(false); setPhase("done"); heading.current?.focus(); }
  }
  const labels = { created: "Criado", ignored: "Ignorado", rejected: "Reprovado", uncertain: "Não confirmado" };
  return <section className="card ia-import" aria-labelledby="import-title" aria-busy={busy}>
    <header className="ia-import-heading">
      <div><h2 id="import-title" ref={heading} tabIndex={-1}>Importar artigos</h2><p>Selecione um JSON com até 50 artigos e 1 MB. A importação cria somente rascunhos.</p></div>
      <button type="button" disabled={busy} onClick={onClose}>Fechar importador</button>
    </header>
    <p className="ia-import-note">Artigos existentes não serão substituídos. Categorias, autores, tags e imagens devem estar cadastrados na gestão editorial.</p>
    {message && <p role="alert">{message}</p>}
    {phase !== "done" && <label className="ia-import-file">Arquivo JSON de artigos
      <input ref={input} type="file" accept=".json,application/json" disabled={busy || phase === "confirm"} onChange={e => { void read(e.target.files?.[0]); e.target.value = ""; }} />
    </label>}
    {loading && <p role="status">Validando arquivo e verificando duplicidades…</p>}
    {phase === "preview" && <div className="ia-toolbar">
      <strong>{rows.length} artigos encontrados · {selected.size} selecionados</strong>
      <button type="button" onClick={() => setSelected(new Set(rows.filter(r => !r.errors.length && !r.duplicate).map(r => r.index)))}>Selecionar válidos</button>
      <button type="button" onClick={() => setSelected(new Set())}>Limpar seleção</button>
    </div>}
    {phase === "confirm" && <div className="ia-import-confirm" role="group" aria-label="Confirmação da importação">
      <h3>Confirmar {selected.size} {selected.size === 1 ? "rascunho" : "rascunhos"}?</h3>
      <p>Nenhum artigo será publicado. Slugs que já existirem no momento da gravação serão ignorados.</p>
      <div className="ia-toolbar"><button type="button" onClick={() => setPhase("preview")}>Voltar à seleção</button><button type="button" onClick={() => void start()}>Confirmar importação</button></div>
    </div>}
    {phase === "running" && <p role="status">Importando: {done} de {rows.length} artigos verificados. Aguarde o resumo.</p>}
    {phase === "done" && <div role="status" className="ia-import-summary">
      <h3>Resultado da importação</h3>
      <p>{results.filter(r => r.status === "created").length} criados · {results.filter(r => r.status === "ignored").length} ignorados · {results.filter(r => r.status === "rejected").length} reprovados</p>
      {results.some(r => r.status === "uncertain") && <p>{results.filter(r => r.status === "uncertain").length} não confirmados. Confira a lista antes de tentar novamente; o servidor bloqueia a repetição de slugs.</p>}
      <p>Nenhum artigo foi publicado por esta importação.</p>
    </div>}
    {!!rows.length && <ol className="ia-import-list">{rows.map(row => {
      const result = results.find(r => r.index === row.index), blocked = !!row.errors.length || row.duplicate;
      return <li key={row.index} className="ia-import-row">
        <label className="ia-import-select"><input type="checkbox" aria-label={`Selecionar ${row.title}`} checked={selected.has(row.index)} disabled={phase !== "preview" || blocked} onChange={e => setSelected(s => { const next = new Set(s); if (e.target.checked) next.add(row.index); else next.delete(row.index); return next; })} /><strong>{row.title}</strong></label>
        <dl><div><dt>Slug</dt><dd>{row.slug || "Não informado"}</dd></div><div><dt>Categoria</dt><dd>{row.category || "Não informada"}</dd></div></dl>
        <p className="ia-import-validation">{result ? labels[result.status] : row.errors.length ? "Reprovado na validação" : row.duplicate ? "Duplicado — não será importado" : "Válido para importar"}</p>
        {result ? <p>{result.message}</p> : row.errors.map((error, i) => <p key={i}>{error}</p>)}
      </li>;
    })}</ol>}
    {phase === "preview" && <div className="ia-toolbar"><button type="button" disabled={!selected.size} onClick={() => { setPhase("confirm"); heading.current?.scrollIntoView({ block: "start" }); }}>Continuar com {selected.size} artigos</button><span>Ignorados: duplicados e não selecionados. Reprovados: documentos inválidos.</span></div>}
    {phase === "done" && <button type="button" onClick={onClose}>Voltar aos artigos</button>}
  </section>;
}
