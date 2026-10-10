import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import "./billing.css";
export function ProviderStatus() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void rpc("billing_provider_status")
      .then(setData)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  return (
    <main className="billing">
      <p className="eyebrow">ADMINISTRAÇÃO SYZIA</p>
      <h1>Cobrança</h1>
      <p>
        Planos, versões e assinaturas são gerenciados pela SYZIA. O provedor
        será responsável pelo processamento da cobrança.
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && <p role="status">Carregando…</p>}
      {data && (
        <>
          <dl className="b-provider-grid">
            <div>
              <dt>Provedor</dt>
              <dd>Não configurado</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>Aguardando integração</dd>
            </div>
            <div>
              <dt>Checkout</dt>
              <dd>Não disponível</dd>
            </div>
            <div>
              <dt>Webhooks</dt>
              <dd>Não configurados</dd>
            </div>
          </dl>
          <p>
            Você pode criar e revisar planos. A contratação com pagamento
            depende da integração e validação do provedor.
          </p>
          {data.local_simulation &&
            import.meta.env.VITE_LOCAL_DEMO === "true" && (
              <p className="notice">
                Ambiente de demonstração: simulações locais não representam
                pagamentos reais.
              </p>
            )}
          <Link className="button" to="/admin/assinaturas">
            Configurar planos e assinaturas
          </Link>
        </>
      )}
    </main>
  );
}
