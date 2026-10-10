import { Link } from "react-router-dom";
export function PagePublication({
  org,
  draft,
  busy,
  canPublish,
  dirty,
  showPrices,
  setShowPrices,
  onPreview,
  onPublish,
  onToggle,
  reviewed,
}: {
  org: string;
  draft: any;
  busy: boolean;
  canPublish: boolean;
  dirty: boolean;
  showPrices: boolean;
  setShowPrices: (v: boolean) => void;
  onPreview: () => void;
  onPublish: () => void;
  onToggle: () => void;
  reviewed: boolean;
}) {
  return (
    <section className="editor-section" id="publicacao">
      <span className="section-kicker">05 · PUBLICAÇÃO</span>
      <h2>Pronto para receber seus clientes?</h2>
      <p>
        Salvar mantém as alterações em rascunho. Publicar atualiza a versão
        disponível aos visitantes.
      </p>
      <ul className="page-readiness">
        {draft.checklist.map((c: any) => (
          <li key={c.id}>
            <strong>
              {c.complete ? "✓" : "○"} {c.label}
            </strong>
            <small>
              {c.complete
                ? "Concluído"
                : c.required
                  ? "Obrigatório para publicar"
                  : "Opcional · não bloqueia a publicação"}
            </small>
            {!c.complete && (
              <>
                <p>{c.help}</p>
                <Link to={"/painel/" + org + "/" + c.href}>
                  Configurar {c.label.toLowerCase()}
                </Link>
              </>
            )}
          </li>
        ))}
      </ul>
      <label className="check-field">
        <input
          type="checkbox"
          disabled={busy || !canPublish}
          checked={showPrices}
          onChange={(e) => setShowPrices(e.target.checked)}
        />
        Exibir preços na página pública
      </label>
      <p className="muted">
        Sem preços publicados, os serviços aparecem sob consulta e não oferecem
        agendamento direto.
      </p>
      {dirty && (
        <p role="status" className="notice">
          Há alterações na identidade, no catálogo ou na ordem dos trabalhos que
          ainda não foram salvas. Salve o rascunho para abrir a prévia.
        </p>
      )}
      {!draft.ready && (
        <p className="notice">
          A publicação precisa dos itens obrigatórios indicados acima. Logo,
          portfólio e agenda online são opcionais.
        </p>
      )}
      {!canPublish && (
        <p className="notice">
          Seu acesso permite consultar a página. Peça a uma pessoa autorizada
          para publicar.
        </p>
      )}
      {canPublish && (
        <p role="status" className="publication-review-state">
          <strong>
            {reviewed && !dirty
              ? "✓ Prévia revisada"
              : "Revise a prévia para publicar"}
          </strong>
          <span>
            {reviewed && !dirty
              ? "Você revisou a versão atual do rascunho."
              : "Salve suas alterações e abra Visualizar como cliente. Uma nova alteração exige nova revisão."}
          </span>
        </p>
      )}
      <div className="editor-actions">
        <button disabled={busy || dirty} onClick={onPreview}>
          Visualizar como cliente
        </button>
        <button
          className="primary"
          disabled={busy || dirty || !draft.ready || !canPublish || !reviewed}
          onClick={onPublish}
        >
          {busy ? "Publicando…" : "Publicar alterações"}
        </button>
        {draft.published && canPublish && (
          <button disabled={busy} onClick={onToggle}>
            {draft.enabled
              ? "Ocultar página pública"
              : "Reativar página publicada"}
          </button>
        )}
      </div>
    </section>
  );
}
