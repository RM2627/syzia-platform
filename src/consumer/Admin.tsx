import { usePermissions } from "../permissions/Permissions";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../api";
import { date, message } from "./api";
import "./consumer.css";
export function ConsumerAdmin({ org, name }: { org: string; name: string }) {
  const { can } = usePermissions();
  const [data, setData] = useState<any>(),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [busy, setBusy] = useState(false),
    [start, setStart] = useState(""),
    [end, setEnd] = useState(""),
    [blockNote, setBlockNote] = useState(""),
    [rules, setRules] = useState<any>();
  async function load() {
    const d = await rpc<any>("consumer_admin_context", { p_org: org });
    setData(d);
    setRules(
      d.schedule || {
        active: false,
        lead_minutes: 120,
        horizon_days: 30,
        buffer_minutes: 0,
        cancel_minutes: 120,
        step_minutes: 30,
        revision: 0,
      },
    );
  }
  useEffect(() => {
    load().catch((e) => setError(message(e)));
  }, [org]);
  async function act(fn: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await fn();
      await load();
      setNotice("Operação concluída.");
    } catch (e) {
      setError(message(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="consumer">
      <main className="c-admin">
        <Link to={"/painel/" + org + "/configuracao"}>
          ← Configuração da empresa
        </Link>
        <h1>Configurar agenda online</h1>
        <p>{name} · disponibilidade e regras para o cliente agendar</p>
        {error && (
          <div role="alert" className="c-error">
            {error}
          </div>
        )}
        {notice && <p role="status">{notice}</p>}
        {data && (
          <>
            <section>
              <h2>Página da empresa</h2>
              <p>
                Identidade visual, catálogo, portfólio, prévia e publicação
                estão reunidos na Página da empresa.
              </p>
              <Link className="c-button" to={"/painel/" + org + "/pagina"}>
                Configurar página da empresa
              </Link>
              <p>
                <Link to={"/painel/" + org + "/configuracao#pagamentos"}>
                  Formas de pagamento aceitas
                </Link>
              </p>
            </section>
            {rules && can("agenda.read") && (
              <section>
                <fieldset
                  className="form-reset"
                  disabled={!can("agenda.manage")}
                >
                  <h2 id="disponibilidade">Disponibilidade para agendamento</h2>
                  <label className="c-check">
                    <input
                      type="checkbox"
                      checked={rules.active}
                      onChange={(e) =>
                        setRules({ ...rules, active: e.target.checked })
                      }
                    />
                    Receber agendamentos
                  </label>
                  <div className="c-admin-grid">
                    {[
                      [
                        "lead_minutes",
                        "Antecedência mínima (minutos)",
                        0,
                        43200,
                      ],
                      ["horizon_days", "Dias disponíveis à frente", 1, 90],
                      [
                        "buffer_minutes",
                        "Intervalo entre atendimentos (minutos)",
                        0,
                        120,
                      ],
                      [
                        "cancel_minutes",
                        "Prazo para cancelar/remarcar (minutos antes)",
                        0,
                        43200,
                      ],
                    ].map(([k, label, min, max]) => (
                      <label key={String(k)}>
                        {label}
                        <input
                          type="number"
                          min={min}
                          max={max}
                          value={rules[String(k)]}
                          onChange={(e) =>
                            setRules({
                              ...rules,
                              [String(k)]: Number(e.target.value),
                            })
                          }
                        />
                      </label>
                    ))}
                    <label>
                      Passo dos horários
                      <select
                        value={rules.step_minutes}
                        onChange={(e) =>
                          setRules({
                            ...rules,
                            step_minutes: Number(e.target.value),
                          })
                        }
                      >
                        {[15, 30, 60].map((n) => (
                          <option value={n} key={n}>
                            {n} minutos
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  <button
                    disabled={busy}
                    onClick={() =>
                      act(async () => {
                        await rpc("consumer_schedule_config", {
                          p_org: org,
                          p_expected_revision: rules.revision,
                          p_rules: Object.fromEntries(
                            [
                              "active",
                              "lead_minutes",
                              "horizon_days",
                              "buffer_minutes",
                              "cancel_minutes",
                              "step_minutes",
                            ].map((k) => [k, rules[k]]),
                          ),
                        });
                      })
                    }
                  >
                    Salvar regras da agenda
                  </button>
                  <p>
                    Os horários disponíveis são os horários de funcionamento
                    publicados da empresa. Mudanças nos horários e serviços
                    precisam ser publicadas.
                  </p>
                  <Link to={"/painel/" + org + "/configuracao#horarios"}>
                    Editar horários de funcionamento
                  </Link>
                  <h3>Bloqueios e indisponibilidades</h3>
                  <p>
                    Informe os horários de Recife. Bloqueios não podem sobrepor
                    reservas confirmadas.
                  </p>
                  <div className="c-admin-grid">
                    <label>
                      Início
                      <input
                        type="datetime-local"
                        value={start}
                        onChange={(e) => setStart(e.target.value)}
                      />
                    </label>
                    <label>
                      Fim
                      <input
                        type="datetime-local"
                        value={end}
                        onChange={(e) => setEnd(e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Motivo interno
                    <input
                      value={blockNote}
                      maxLength={1000}
                      onChange={(e) => setBlockNote(e.target.value)}
                    />
                  </label>
                  <button
                    disabled={busy || !start || !end}
                    onClick={() =>
                      act(async () => {
                        await rpc("consumer_schedule_block", {
                          p_org: org,
                          p_start: start + ":00-03:00",
                          p_end: end + ":00-03:00",
                          p_note: blockNote,
                          p_key: crypto.randomUUID(),
                        });
                        setStart("");
                        setEnd("");
                        setBlockNote("");
                      })
                    }
                  >
                    Adicionar bloqueio
                  </button>
                  {data.blocks.map((b: any) => (
                    <div key={b.code}>
                      <span>
                        {date(b.starts_at)} — {date(b.ends_at)} · {b.note}
                      </span>
                      <button
                        disabled={busy}
                        onClick={() =>
                          act(async () => {
                            await rpc("consumer_remove_block", {
                              p_org: org,
                              p_code: b.code,
                            });
                          })
                        }
                      >
                        Remover bloqueio
                      </button>
                    </div>
                  ))}
                </fieldset>
              </section>
            )}
            <section>
              <h2>Atendimento e operação</h2>
              <p>
                As solicitações recebidas continuam na Central de Atendimento. A
                duração e a opção de agendamento direto pertencem a cada
                serviço.
              </p>
              <Link className="c-button" to={"/painel/" + org + "/atendimento"}>
                Abrir Atendimento
              </Link>{" "}
              <Link to={"/painel/" + org + "/servicos"}>
                Configurar serviços
              </Link>
            </section>
          </>
        )}
      </main>
    </div>
  );
}
