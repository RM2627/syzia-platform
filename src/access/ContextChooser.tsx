import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  accessApi,
  accessMessage,
  AccessFrame,
  companyEntryPath,
} from "./EnterpriseAccess";
export function ContextChooser() {
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    accessApi("/access/contexts", {})
      .then(setData)
      .catch((e) => setError(accessMessage(e)));
  }, []);
  async function select(a: any) {
    setBusy(true);
    try {
      await accessApi("/access/context", { account_id: a?.id || null });
      window.location.assign(
        a?.organization_id
          ? await companyEntryPath(a.organization_id)
          : data?.super_admin
            ? "/admin/empresas"
            : "/operacao-syzia",
      );
    } catch (e) {
      setError(accessMessage(e));
      setBusy(false);
    }
  }
  return (
    <AccessFrame>
      <h1>Escolha seu ambiente</h1>
      <p>Seu acesso é validado para cada empresa.</p>
      {error && <p role="alert">{error}</p>}
      {data?.global && (
        <button disabled={busy} onClick={() => void select(null)}>
          Abrir meu ambiente SYZIA
        </button>
      )}
      {data?.companies.map((a: any) => (
        <button key={a.id} disabled={busy} onClick={() => void select(a)}>
          {a.name}
        </button>
      ))}
      {data && !data.companies.length && !data.global && (
        <p>Você ainda não possui empresa vinculada.</p>
      )}
      <Link to="/cadastrar">Continuar cadastro de empresa</Link>
    </AccessFrame>
  );
}
