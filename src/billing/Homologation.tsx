import { useEffect, useState } from "react";
import { rpc, errorMessage } from "../api";

export function Homologation({
  org,
  current,
  versions,
  onChange,
}: {
  org: string;
  current: any;
  versions: any[];
  onChange: () => void;
}) {
  const [version, setVersion] = useState(current?.plan.id || ""),
    [reason, setReason] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  useEffect(() => {
    setVersion(current?.plan.id || "");
    setReason("");
    setError("");
  }, [org, current?.id]);
  async function save(end = false) {
    if (
      end &&
      !confirm(
        "Encerrar a homologação e voltar à situação comercial legítima da empresa? Os dados operacionais serão preservados.",
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await rpc("billing_homologation_set", {
        p_org: org,
        p_version: end ? null : version,
        p_expected: current?.id || null,
        p_reason: reason,
        p_key: crypto.randomUUID(),
      });
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section
      className="ds-panel b-homologation"
      aria-label="Plano para homologação"
    >
      <h2>Aplicar plano para homologação</h2>
      <p>
        Teste a versão selecionada entrando com o administrador real da empresa.
        A aplicação usa os recursos e limites dessa versão.
      </p>
      {current && (
        <p role="status">
          <strong>
            PLANO APLICADO PARA HOMOLOGAÇÃO — não representa assinatura ou
            pagamento.
          </strong>
          <br />
          {current.plan.name} · versão {current.plan.version}
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <label>
          Versão do plano
          <select
            required
            value={version}
            disabled={busy}
            onChange={(e) => setVersion(e.target.value)}
          >
            <option value="">Selecione uma versão real</option>
            {versions.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name} · versão {v.version}
              </option>
            ))}
          </select>
        </label>
        <label>
          Motivo da alteração
          <textarea
            required
            minLength={10}
            maxLength={500}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
        </label>
        <p>
          Não consome trial e não cria pagamento ou assinatura. Ao encerrar, as
          condições comerciais existentes voltam a determinar o acesso.
        </p>
        <button
          className="primary"
          disabled={busy || !version || reason.trim().length < 10}
        >
          {current
            ? "Trocar plano de homologação"
            : "Aplicar plano para homologação"}
        </button>
        {current && (
          <button
            type="button"
            disabled={busy || reason.trim().length < 10}
            onClick={() => void save(true)}
          >
            Encerrar homologação
          </button>
        )}
      </form>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}

export function FeaturedPlan({
  plan,
  previous,
  onChange,
}: {
  plan: any;
  previous: any;
  onChange: () => void;
}) {
  const [label, setLabel] = useState(plan.featured_label || "Mais recomendado"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  async function change(remove = false) {
    if (
      !plan.featured &&
      previous &&
      previous.id !== plan.id &&
      !confirm(`Substituir o destaque de ${previous.name} por ${plan.name}?`)
    )
      return;
    setBusy(true);
    setError("");
    try {
      await rpc("billing_plan_feature", {
        p_plan: remove ? null : plan.id,
        p_label: label,
        p_previous: previous?.id || null,
      });
      onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="b-feature-config">
      <summary>Destaque na comparação</summary>
      <label>
        Texto do selo
        <input
          value={label}
          maxLength={60}
          onChange={(e) => setLabel(e.target.value)}
        />
      </label>
      <button
        type="button"
        disabled={
          busy ||
          !label.trim() ||
          !plan.site_visible ||
          !plan.active ||
          !plan.available
        }
        onClick={() => void change()}
      >
        {plan.featured
          ? "Salvar texto do destaque"
          : "Destacar este plano na comparação"}
      </button>
      {plan.featured && (
        <button type="button" disabled={busy} onClick={() => void change(true)}>
          Remover destaque
        </button>
      )}
      <small>
        O destaque é visual e não altera a versão, os recursos ou o preço.
      </small>
      {error && <p role="alert">{error}</p>}
    </details>
  );
}
