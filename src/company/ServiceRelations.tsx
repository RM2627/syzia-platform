import { useEffect, useState } from "react";
import { rpc } from "../api";
export function ServiceRelations({
  org,
  service,
  services,
  editable,
  onChange,
}: {
  org: string;
  service: any;
  services: any[];
  editable: boolean;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(),
    [target, setTarget] = useState(""),
    [kind, setKind] = useState("includes"),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const load = async () =>
    setData(await rpc("company_service_relations", { p_org: org }));
  useEffect(() => {
    setError("");
    setTarget("");
    load().catch(() => setError("Não foi possível carregar as relações."));
  }, [org, service.id]);
  const name = (id: string) =>
    services.find((s) => s.id === id)?.name || "Serviço desativado";
  const description = (r: any) =>
    r.kind === "includes"
      ? `${name(r.source_id)} inclui ${name(r.target_id)}`
      : `${name(r.source_id)} + ${name(r.target_id)}: ${r.kind === "incompatible" ? "incompatíveis" : "requer revisão"}`;
  async function save(
    source: string,
    targetId: string,
    relation: string | null,
  ) {
    setBusy(true);
    setError("");
    try {
      await rpc("company_service_relation_save", {
        p_org: org,
        p_source: source,
        p_target: targetId,
        p_kind: relation,
        p_expected_revision: data.revision,
      });
      setTarget("");
      await onChange();
      await load();
    } catch (e: any) {
      const messages: Record<string, string> = {
        relation_self: "Escolha outro serviço.",
        relation_duplicate_or_contradictory:
          "Essa relação já existe ou contradiz outra relação. Remova a relação anterior antes de redefinir.",
        relation_inclusion_cycle:
          "Essa inclusão criaria um ciclo entre serviços. Revise a direção das relações.",
        company_revision_conflict:
          "O catálogo foi alterado. Recarregue as relações e confira antes de salvar.",
        service_unavailable:
          "Ative os dois serviços antes de configurar uma relação.",
      };
      setError(
        messages[e.message] ||
          "Não foi possível salvar. Confira sua permissão de gestão de serviços e tente novamente.",
      );
      await load();
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card">
      <h2>Relações com outros serviços</h2>
      <p>
        As relações entram na página pública após revisar e publicar o catálogo.
      </p>
      <p>
        “Já incluído” tem direção: <strong>{service.name}</strong> inclui o
        serviço escolhido. Incompatibilidade e revisão valem para a combinação.
      </p>
      {data?.relations
        .filter(
          (r: any) => r.source_id === service.id || r.target_id === service.id,
        )
        .map((r: any) => (
          <div className="record-list" key={r.id}>
            <span>{description(r)}</span>
            {editable && (
              <button
                disabled={busy}
                onClick={() => save(r.source_id, r.target_id, null)}
                aria-label={"Remover relação: " + description(r)}
              >
                Remover relação
              </button>
            )}
          </div>
        ))}
      {editable && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save(service.id, target, kind);
          }}
        >
          <label>
            Outro serviço da empresa
            <select
              required
              value={target}
              disabled={busy || !data}
              onChange={(e) => setTarget(e.target.value)}
            >
              <option value="">Selecione</option>
              {services
                .filter((s) => s.id !== service.id && s.active)
                .map((s) => (
                  <option value={s.id} key={s.id}>
                    {s.name}
                  </option>
                ))}
            </select>
          </label>
          <label>
            Tipo de relação
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              disabled={busy}
            >
              <option value="includes">Já incluído</option>
              <option value="incompatible">Incompatível</option>
              <option value="review">Requer revisão</option>
            </select>
          </label>
          <button disabled={busy || !data || !target || !service.active}>
            {busy ? "Salvando…" : "Adicionar relação"}
          </button>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
