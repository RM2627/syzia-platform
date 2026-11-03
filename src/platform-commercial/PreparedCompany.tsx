import { useEffect, useState } from "react";
import { rpc } from "../api";
import {commercialApi,commercialError} from "./api";
import './prepared-company.css';
async function finalize(org:string){
  const r=await rpc<any>("commercial_import_finalize",{p_org:org});
  if(!r?.pending)return r;
  try{return await commercialApi("materialize",{organization_id:org});}
  catch(e){return {...r,confirmation_error:commercialError(e)};}
}
import { Link, useLocation } from "react-router-dom";
export function PreparedCompany({ org, refreshKey = 0 }: { org: string; refreshKey?: number }) {
  const [result, setResult] = useState<{org: string; value: any} | null>(null);
  const location = useLocation();
  const state = result?.org === org ? result.value : null;
  const onSubscription = location.pathname === `/painel/${org}/assinatura`;
  useEffect(() => {
    let live = true;
    void finalize(org)
      .then((x) => {
        if (live) setResult({org, value:x});
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [org, location.pathname, refreshKey]);
  if (!state?.pending && !state?.activated) return null;
  return (
    <section className="prepared-company" aria-label="Configuração preparada">
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
      {state.pending ? !onSubscription && (
        <Link to={"/painel/" + org + "/assinatura"}>Ver modalidades e assinatura</Link>
      ) : (
        <Link to={"/painel/" + org + "/configuracao"}>Conferir catálogo</Link>
      )}
      {state.confirmation_error && <p role="alert">{state.confirmation_error}</p>}
    </section>
  );
}
