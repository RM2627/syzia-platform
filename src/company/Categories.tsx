import { useFinancialCommand } from "../finance/useFinancialCommand";
import { useState, type FormEvent } from "react";
import { rpc, errorMessage } from "../api";
import { usePermissions } from "../permissions/Permissions";
export function Categories({
  org,
  data,
  onChange,
}: {
  org: string;
  data: any[];
  onChange: () => Promise<void>;
}) {
  const command = useFinancialCommand();
  const { can } = usePermissions();
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function save(id: string | null, revision: number, payload: any) {
    setBusy(true);
    setError("");
    try {
      await command("company_category_save", {
        p_org: org,
        p_id: id,
        p_revision: revision,
        p_data: payload,
        p_key: crypto.randomUUID(),
      });
      // company_context already includes the authorized category list and usage.
      await onChange();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  function form(e: FormEvent<HTMLFormElement>, c?: any) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void save(c?.id || null, c?.revision || 0, {
      name: f.get("name"),
      position: Number(f.get("position") || 0),
    });
  }
  return (
    <details className="card">
      <summary>Categorias de serviços</summary>
      <p>
        Reutilize categorias para organizar o catálogo. Desativar preserva os
        serviços já vinculados.
      </p>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {data.map((c) => (
        <div className="list-row" key={c.id}>
          <form onSubmit={(e) => form(e, c)}>
            <fieldset
              disabled={busy || !can("services.manage")}
              className="finance-form"
            >
              <label className="field">
                Categoria
                <input
                  name="name"
                  defaultValue={c.name}
                  required
                  maxLength={120}
                />
              </label>
              <label className="field">
                Ordem
                <input
                  name="position"
                  type="number"
                  min="0"
                  max="10000"
                  defaultValue={c.position}
                />
              </label>
              <button>Salvar</button>
              <button
                type="button"
                onClick={() =>
                  void save(c.id, c.revision, { active: !c.active })
                }
              >
                {c.active ? "Desativar" : "Ativar"}
              </button>
              <button
                type="button"
                disabled={Number(c.in_use) > 0}
                onClick={() => void save(c.id, c.revision, { delete: true })}
              >
                Excluir
              </button>
            </fieldset>
            <small>
              {c.in_use} serviço(s) · {c.active ? "Ativa" : "Inativa"}
            </small>
          </form>
        </div>
      ))}
      {can("services.manage") && (
        <form onSubmit={(e) => form(e)}>
          <fieldset disabled={busy} className="finance-form">
            <label className="field">
              Nova categoria
              <input name="name" maxLength={120} required />
            </label>
            <button className="primary">Criar categoria</button>
          </fieldset>
        </form>
      )}
    </details>
  );
}
