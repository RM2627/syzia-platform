import { useEffect, useState } from "react";
import { rpc } from "../api";
import { Link, useLocation } from "react-router-dom";
export function PreparedCompany({ org }: { org: string }) {
  const [state, setState] = useState<any>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const location = useLocation();
  async function refresh() {
    setBusy(true);
    setError("");
    try {
      setState(await rpc("commercial_import_finalize", { p_org: org }));
    } catch {
      setError(
        "Não foi possível verificar a configuração preparada. Tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    let live = true;
    void rpc("commercial_import_finalize", { p_org: org })
      .then((x) => {
        if (live) setState(x);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [org, location.pathname]);
  if (!state?.pending && !state?.activated) return null;
  return (
    <aside className="notice">
      <strong>
        {state.activated
          ? "Catálogo preparado habilitado"
          : "Configuração comercial preservada"}
      </strong>
      <p>
        {state.activated
          ? "A assinatura foi confirmada. Abra a configuração para conferir o catálogo. A página continua sem publicação automática."
          : "O catálogo preparado será habilitado depois da confirmação válida da assinatura. A página continua sem publicação automática."}
      </p>
      {state.pending ? (
        <>
          <Link to={"/painel/" + org + "/assinatura"}>
            Continuar contratação
          </Link>{" "}
          <button disabled={busy} onClick={() => void refresh()}>
            Verificar confirmação
          </button>
        </>
      ) : (
        <Link to={"/painel/" + org + "/configuracao"}>Conferir catálogo</Link>
      )}
      {error && <p role="alert">{error}</p>}
    </aside>
  );
}
