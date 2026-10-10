import { usePermissions } from "../permissions/Permissions";
import { useEffect, useState } from "react";
import { rpc } from "../api";
import { message } from "./api";
const empty = {
  online_opt_in: false,
  external_methods: ["pix_external", "cash", "card_present"],
  advance_rule: "none",
  deposit_kind: null as string | null,
  deposit_cents: null as number | null,
  deposit_basis_points: null as number | null,
  cancellation_refund_policy: "",
};
export function PaymentPreparation({ org }: { org: string }) {
  const { can } = usePermissions();
  const [rules, setRules] = useState<any[]>([]),
    [services, setServices] = useState<any[]>([]),
    [service, setService] = useState(""),
    [form, setForm] = useState({ ...empty }),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false);
  async function load() {
    const [r, p] = await Promise.all([
      rpc<any[]>("consumer_payment_rules_context", { p_org: org }),
      rpc<any>("consumer_presence_context", { p_org: org }),
    ]);
    setRules(r);
    setServices(p.services);
    return r;
  }
  function select(code: string, r = rules) {
    setService(code);
    const found = r.find((x) => (x.service || "") === code);
    setForm(
      found
        ? (Object.fromEntries(
            Object.keys(empty).map((k) => [k, found[k]]),
          ) as typeof empty)
        : { ...empty },
    );
  }
  useEffect(() => {
    load()
      .then((r) => select("", r))
      .catch((e) => setError(message(e)));
  }, [org]);
  const deposit = ["optional_deposit", "required_deposit"].includes(
    form.advance_rule,
  );
  return (
    <section>
      <fieldset className="form-reset" disabled={!can("settings.manage")}>
        <details>
          <summary>Preparação de pagamentos opcionais</summary>
          <p className="c-preparation">
            Planejamento para uma fase futura. Nenhuma cobrança é criada ou
            confirmada. Estas regras não bloqueiam o orçamento nem a agenda
            nesta fase. A empresa poderá continuar recebendo pelos seus próprios
            meios.
          </p>
          {error && (
            <div role="alert" className="c-error">
              {error}
            </div>
          )}
          {notice && <p role="status">{notice}</p>}
          <label>
            Aplicação da regra
            <select value={service} onChange={(e) => select(e.target.value)}>
              <option value="">Padrão da empresa</option>
              {services.map((s) => (
                <option key={s.code} value={s.code}>
                  {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="c-check">
            <input
              type="checkbox"
              checked={form.online_opt_in}
              onChange={(e) =>
                setForm({ ...form, online_opt_in: e.target.checked })
              }
            />
            Preparar recebimento online opcional no futuro (não ativa gateway)
          </label>
          <h3>Meios externos aceitos</h3>
          {Object.entries({
            pix_external: "Pix próprio da empresa",
            card_present: "Cartão presencial / maquininha",
            cash: "Dinheiro",
            transfer: "Transferência",
            other: "Outro meio externo",
          }).map(([v, t]) => (
            <label className="c-check" key={v}>
              <input
                type="checkbox"
                checked={form.external_methods.includes(v)}
                onChange={(e) =>
                  setForm({
                    ...form,
                    external_methods: e.target.checked
                      ? [...form.external_methods, v]
                      : form.external_methods.filter((x) => x !== v),
                  })
                }
              />
              {t}
            </label>
          ))}
          <label>
            Regra futura de antecipação
            <select
              value={form.advance_rule}
              onChange={(e) => {
                const dep = ["optional_deposit", "required_deposit"].includes(
                  e.target.value,
                );
                setForm({
                  ...form,
                  advance_rule: e.target.value,
                  deposit_kind: dep ? "percent" : null,
                  deposit_cents: null,
                  deposit_basis_points: dep ? 3000 : null,
                });
              }}
            >
              {Object.entries({
                none: "Nenhum pagamento antecipado",
                at_service: "Pagamento no atendimento",
                optional_deposit: "Sinal opcional",
                required_deposit: "Sinal obrigatório",
                full_advance: "Integral antecipado",
              }).map(([v, t]) => (
                <option key={v} value={v}>
                  {t}
                </option>
              ))}
            </select>
          </label>
          {deposit && (
            <div className="c-admin-grid">
              <label>
                Tipo de sinal
                <select
                  value={form.deposit_kind || "percent"}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      deposit_kind: e.target.value,
                      deposit_cents: e.target.value === "fixed" ? 1000 : null,
                      deposit_basis_points:
                        e.target.value === "percent" ? 3000 : null,
                    })
                  }
                >
                  <option value="percent">Percentual do orçamento</option>
                  <option value="fixed">Valor fixo</option>
                </select>
              </label>
              {form.deposit_kind === "fixed" ? (
                <label>
                  Valor do sinal (R$)
                  <input
                    type="number"
                    min={0.01}
                    step={0.01}
                    value={(form.deposit_cents || 0) / 100}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        deposit_cents: Math.round(Number(e.target.value) * 100),
                      })
                    }
                  />
                </label>
              ) : (
                <label>
                  Percentual do sinal (%)
                  <input
                    type="number"
                    min={0.01}
                    max={100}
                    step={0.01}
                    value={(form.deposit_basis_points || 0) / 100}
                    onChange={(e) =>
                      setForm({
                        ...form,
                        deposit_basis_points: Math.round(
                          Number(e.target.value) * 100,
                        ),
                      })
                    }
                  />
                </label>
              )}
            </div>
          )}
          <label>
            Diretrizes futuras de cancelamento/reembolso
            <textarea
              maxLength={4000}
              value={form.cancellation_refund_policy}
              onChange={(e) =>
                setForm({ ...form, cancellation_refund_policy: e.target.value })
              }
            />
          </label>
          <button
            disabled={busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await rpc("consumer_payment_rule_save", {
                  p_org: org,
                  p_service: service || null,
                  p_revision:
                    rules.find((x) => (x.service || "") === service)
                      ?.revision || 0,
                  p_data: form,
                });
                await load();
                setNotice(
                  "Preparação salva. Nenhum meio de pagamento foi ativado.",
                );
              } catch (e) {
                setError(message(e));
              } finally {
                setBusy(false);
              }
            }}
          >
            Salvar preparação financeira
          </button>
          <p>
            Uma futura confirmação manual será identificada como externa e terá
            responsável na auditoria. Nunca será exibida como confirmação
            automática do provedor.
          </p>
        </details>
      </fieldset>
    </section>
  );
}
