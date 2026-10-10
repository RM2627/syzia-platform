import { useEffect, useState } from "react";
import { rpc, errorMessage } from "../api";
import "./availability.css";
import {
  supportBenefit,
  supportDescription,
  supportModes,
} from "./support-copy";
type Hours = { day: number; open: string; close: string }[];
const days = [
  "Domingo",
  "Segunda",
  "Terça",
  "Quarta",
  "Quinta",
  "Sexta",
  "Sábado",
];
export function WeeklyHours({
  hours,
  onChange,
}: {
  hours: Hours;
  onChange: (h: Hours) => void;
}) {
  return (
    <div className="av-week">
      {days.map((day, d) => (
        <div className="av-day" key={day}>
          <strong>{day}</strong>
          <div>
            {!hours.some((h) => h.day === d) && (
              <span className="muted">Não atende</span>
            )}
            {hours.map(
              (h, i) =>
                h.day === d && (
                  <div className="av-interval" key={i}>
                    <label>
                      Início{" "}
                      <input
                        type="time"
                        required
                        aria-label={`${day} início ${i + 1}`}
                        value={h.open}
                        onChange={(e) =>
                          onChange(
                            hours.map((x, n) =>
                              n === i ? { ...x, open: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <label>
                      Fim{" "}
                      <input
                        type="time"
                        required
                        aria-label={`${day} fim ${i + 1}`}
                        value={h.close}
                        onChange={(e) =>
                          onChange(
                            hours.map((x, n) =>
                              n === i ? { ...x, close: e.target.value } : x,
                            ),
                          )
                        }
                      />
                    </label>
                    <button
                      type="button"
                      aria-label={`Remover intervalo ${day} ${i + 1}`}
                      onClick={() => onChange(hours.filter((_, n) => n !== i))}
                    >
                      Remover
                    </button>
                  </div>
                ),
            )}
          </div>
          <button
            type="button"
            onClick={() =>
              onChange([...hours, { day: d, open: "", close: "" }])
            }
          >
            Adicionar intervalo · {day}
          </button>
        </div>
      ))}
    </div>
  );
}
export function EmployeeAvailability({
  org,
  data,
}: {
  org: string;
  data: any;
}) {
  const [selected, setSelected] = useState(""),
    [members, setMembers] = useState<any[]>(data?.members || []);
  useEffect(() => {
    setMembers(data?.members || []);
  }, [data]);
  useEffect(() => setSelected(""), [org]);
  const person = members.find((m) => m.user_id === selected);
  return (
    <section
      className="av-panel"
      aria-label="Disponibilidade para atendimentos"
    >
      <h3>Disponibilidade para atendimentos</h3>
      <p>
        Defina quando cada pessoa da empresa pode executar um atendimento. Fuso:{" "}
        {data?.timezone}.
      </p>
      <label>
        Funcionário
        <select value={selected} onChange={(e) => setSelected(e.target.value)}>
          <option value="">Selecione uma pessoa da empresa</option>
          {members.map((m) => (
            <option key={m.user_id} value={m.user_id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {person && (
        <EmployeeForm
          key={org + person.user_id}
          org={org}
          person={person}
          timezone={data.timezone}
          onSaved={(m) =>
            setMembers((ms) =>
              ms.map((x) => (x.user_id === m.user_id ? { ...x, ...m } : x)),
            )
          }
        />
      )}
    </section>
  );
}
function EmployeeForm({
  org,
  person,
  timezone,
  onSaved,
}: {
  org: string;
  person: any;
  timezone: string;
  onSaved: (m: any) => void;
}) {
  const [inherit, setInherit] = useState(person.inherit_company),
    [hours, setHours] = useState<Hours>(person.hours),
    [blocks, setBlocks] = useState<any[]>(person.blocks),
    [revision, setRevision] = useState(person.revision),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const [outside, setOutside] = useState(person.outside_count);
  return (
    <form
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        setMessage("");
        try {
          const r = await rpc<any>("employee_availability_save", {
            p_org: org,
            p_user: person.user_id,
            p_revision: revision,
            p_inherit: inherit,
            p_hours: hours,
            p_blocks: blocks,
          });
          setRevision(r.revision);
          setOutside(r.outside_count);
          setBlocks(r.blocks);
          onSaved(r);
          setMessage(
            "Disponibilidade salva. Os agendamentos existentes foram preservados.",
          );
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}
    >
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="notice">
          {message}
        </p>
      )}
      {outside > 0 && (
        <p role="status" className="notice">
          {outside} compromisso(s) futuro(s) fora desta disponibilidade. Revise
          na Agenda; nenhuma reserva foi movida ou cancelada.
        </p>
      )}
      <fieldset disabled={busy}>
        <legend>{person.name}</legend>
        <label className="check-field">
          <input
            type="checkbox"
            checked={inherit}
            onChange={(e) => setInherit(e.target.checked)}
          />
          Usar horário geral da empresa
        </label>
        {!inherit && <WeeklyHours hours={hours} onChange={setHours} />}
        <h4>Indisponibilidade pontual</h4>
        <p>
          Datas e horários em {timezone}. Os bloqueios gerais da Agenda
          continuam valendo.
        </p>
        {blocks.map((b, i) => (
          <div key={i} className="av-block">
            <label>
              Data
              <input
                type="date"
                required
                value={b.date || ""}
                onChange={(e) =>
                  setBlocks(
                    blocks.map((x, n) =>
                      n === i ? { ...x, date: e.target.value } : x,
                    ),
                  )
                }
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={b.all_day}
                onChange={(e) =>
                  setBlocks(
                    blocks.map((x, n) =>
                      n === i ? { ...x, all_day: e.target.checked } : x,
                    ),
                  )
                }
              />
              Dia inteiro
            </label>
            {!b.all_day && (
              <>
                <label>
                  Das
                  <input
                    type="time"
                    required
                    value={b.open || ""}
                    onChange={(e) =>
                      setBlocks(
                        blocks.map((x, n) =>
                          n === i ? { ...x, open: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
                <label>
                  Até
                  <input
                    type="time"
                    required
                    value={b.close || ""}
                    onChange={(e) =>
                      setBlocks(
                        blocks.map((x, n) =>
                          n === i ? { ...x, close: e.target.value } : x,
                        ),
                      )
                    }
                  />
                </label>
              </>
            )}
            <button
              type="button"
              onClick={() => setBlocks(blocks.filter((_, n) => n !== i))}
            >
              Remover bloqueio
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setBlocks([
              ...blocks,
              { date: "", all_day: true, open: "", close: "" },
            ])
          }
        >
          Adicionar indisponibilidade
        </button>
        <p>
          <button className="primary">
            {busy ? "Salvando…" : "Salvar disponibilidade"}
          </button>
        </p>
      </fieldset>
    </form>
  );
}
const stateLabels: Record<string, string> = {
  unconfigured: "Limite pendente de configuração",
  cycle_required: "Ciclo pendente de configuração",
  not_included: "Atendimento compartilhado não incluído",
  warning: "Próximo do limite",
  exhausted: "Limite atingido",
  available: "Disponível no ciclo",
};
function Usage({ usage: u }: { usage: any }) {
  return (
    <div>
      <strong>
        {u.used} de {u.included ?? "limite não definido"} utilizados neste ciclo
      </strong>
      <p>
        {stateLabels[u.state]} · {supportModes[u.availability_mode]}
      </p>
      <p>
        {!u.policy_active
          ? "Apoio compartilhado desativado"
          : u.human_open
            ? "Há equipe disponível para assumir; o apoio depende da fila e das permissões."
            : "A equipe compartilhada poderá auxiliar quando houver disponibilidade."}
      </p>
      {u.availability_mode === "scheduled" && (
        <details>
          <summary>Consultar horário programado</summary>
          <p>Fuso: {u.support_timezone}.</p>
          {(u.support_hours || []).map((h: any, i: number) => (
            <p key={i}>
              {days[h.day]} · {h.open}–{h.close}
            </p>
          ))}
        </details>
      )}
      {u.start && u.end && (
        <small>
          {new Date(u.start).toLocaleString("pt-BR")} —{" "}
          {new Date(u.end).toLocaleString("pt-BR")}
        </small>
      )}
    </div>
  );
}
export function AssistedPolicy({
  platform = false,
  org,
}: {
  platform?: boolean;
  org?: string;
}) {
  const [data, setData] = useState<any>(),
    [error, setError] = useState("");
  useEffect(() => {
    let live = true;
    setData(undefined);
    setError("");
    if (platform || org)
      void rpc<any>(
        platform ? "assisted_admin_context" : "assisted_company_usage",
        platform ? {} : { p_org: org },
      )
        .then((d) => {
          if (live) setData(d);
        })
        .catch((e) => {
          if (live) setError(errorMessage(e));
        });
    return () => {
      live = false;
    };
  }, [org, platform]);
  return (
    <section className="card av-panel">
      <h2>Atendimento compartilhado</h2>
      <p>
        <strong>{supportBenefit}</strong>. {supportDescription}
      </p>
      {error && <p role="alert">{error}</p>}
      {!data && !error && (
        <p role="status">Carregando política de atendimento…</p>
      )}
      {data &&
        (platform ? (
          <AssistedAdmin data={data} onData={setData} />
        ) : (
          <>
            <Usage usage={data} />
            <p>
              A própria empresa pode continuar atendendo, mesmo após o limite
              compartilhado. Não há cobrança automática por excedente.
            </p>
            <details>
              <summary>Ciclos anteriores</summary>
              {data.history.map((c: any) => (
                <p key={c.id}>
                  {new Date(c.start).toLocaleDateString("pt-BR")} —{" "}
                  {new Date(c.end).toLocaleDateString("pt-BR")}: {c.used}{" "}
                  atendimento(s)
                </p>
              ))}
            </details>
          </>
        ))}
    </section>
  );
}
function AssistedAdmin({
  data,
  onData,
}: {
  data: any;
  onData: (d: any) => void;
}) {
  const [p, setP] = useState(data.policy),
    [version, setVersion] = useState(""),
    [included, setIncluded] = useState(""),
    [warning, setWarning] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState("");
  const v = data.versions.find((x: any) => x.id === version);
  async function save(name: string, args: any) {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await rpc(name, args);
      const d = await rpc<any>("assisted_admin_context");
      onData(d);
      setP(d.policy);
      setMessage("Configuração salva e auditada.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      {error && (
        <p role="alert" className="notice error">
          {error}
        </p>
      )}
      {message && <p role="status">{message}</p>}
      <p>
        Uma unidade corresponde a um ticket assumido pela Equipe SYZIA no ciclo.
        Mensagens adicionais no mesmo ticket não multiplicam o consumo.
      </p>
      <details>
        <summary>Horário global da Equipe SYZIA</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void save("assisted_policy_mode_save", {
              p_revision: p.revision,
              p_active: p.active,
              p_hours: p.hours,
              p_timezone: p.timezone,
              p_message: p.outside_message,
              p_mode: p.availability_mode,
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Modelo de disponibilidade
              <select
                value={p.availability_mode}
                onChange={(e) =>
                  setP({ ...p, availability_mode: e.target.value })
                }
              >
                <option value="flexible">
                  Conforme disponibilidade da equipe
                </option>
                <option value="scheduled">Horário programado</option>
              </select>
            </label>
            {p.availability_mode === "flexible" && (
              <p>
                A grade semanal não é obrigatória. A presença da Central indica
                quem pode assumir novos atendimentos. Tickets e mensagens
                continuam na fila quando não houver equipe disponível; entrar na
                fila não consome unidade.
              </p>
            )}
            <label className="check-field">
              <input
                type="checkbox"
                checked={p.active}
                onChange={(e) => setP({ ...p, active: e.target.checked })}
              />
              Atendimento compartilhado ativo
            </label>
            {p.availability_mode === "scheduled" && (
              <>
                <label>
                  Timezone
                  <input
                    required
                    value={p.timezone}
                    onChange={(e) => setP({ ...p, timezone: e.target.value })}
                    placeholder="Ex.: America/Sao_Paulo"
                  />
                </label>
                <WeeklyHours
                  hours={p.hours}
                  onChange={(h) => setP({ ...p, hours: h })}
                />
                <label>
                  Mensagem fora do horário
                  <textarea
                    required
                    minLength={10}
                    maxLength={400}
                    value={p.outside_message}
                    onChange={(e) =>
                      setP({ ...p, outside_message: e.target.value })
                    }
                  />
                </label>
              </>
            )}
            <button className="primary">Salvar horário compartilhado</button>
          </fieldset>
        </form>
      </details>
      <details>
        <summary>Limite por versão do plano</summary>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (v)
              void save("assisted_plan_save", {
                p_version: version,
                p_revision: v.revision,
                p_included: included === "" ? null : Number(included),
                p_warning: warning === "" ? null : Number(warning),
              });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Versão Assistido
              <select
                required
                value={version}
                onChange={(e) => {
                  setVersion(e.target.value);
                  const x = data.versions.find(
                    (x: any) => x.id === e.target.value,
                  );
                  setIncluded(x?.included == null ? "" : String(x.included));
                  setWarning(x?.warning_at == null ? "" : String(x.warning_at));
                }}
              >
                <option value="">Selecione a versão</option>
                {data.versions.map((x: any) => (
                  <option value={x.id} key={x.id}>
                    {x.name} · versão {x.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Atendimentos incluídos por ciclo
              <input
                type="number"
                min={0}
                step={1}
                value={included}
                onChange={(e) => setIncluded(e.target.value)}
              />
            </label>
            <label>
              Avisar a partir de quantos atendimentos
              <input
                type="number"
                min={0}
                max={included || undefined}
                step={1}
                value={warning}
                onChange={(e) => setWarning(e.target.value)}
              />
            </label>
            <p>
              Em branco: configuração pendente; novos tickets compartilhados não
              podem ser assumidos. Alterar o limite não zera o uso.
            </p>
            <button disabled={!v} className="primary">
              Salvar limite compartilhado
            </button>
          </fieldset>
        </form>
      </details>
      <details>
        <summary>Ciclo informado pela assinatura</summary>
        <p>
          O período vigente da assinatura é utilizado automaticamente no
          primeiro atendimento. Um ciclo explícito pode ser informado aqui, sem
          provedor de pagamento.
        </p>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void save("assisted_cycle_start", {
              p_org: f.get("org"),
              p_version: f.get("version"),
              p_start: new Date(String(f.get("start"))).toISOString(),
              p_end: new Date(String(f.get("end"))).toISOString(),
              p_reference: f.get("reference"),
            });
          }}
        >
          <fieldset disabled={busy}>
            <label>
              Empresa
              <select name="org" required>
                <option value="">Selecione</option>
                {data.companies.map((c: any) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Versão do plano
              <select name="version" required>
                <option value="">Selecione</option>
                {data.versions.map((v: any) => (
                  <option key={v.id} value={v.id}>
                    {v.name} · {v.version}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Início (horário deste dispositivo)
              <input type="datetime-local" name="start" required />
            </label>
            <label>
              Fim (horário deste dispositivo)
              <input type="datetime-local" name="end" required />
            </label>
            <label>
              Referência única do ciclo
              <input name="reference" required maxLength={160} />
            </label>
            <p>
              Ciclos não podem se sobrepor. Reenviar a mesma referência e
              período não reinicia o consumo.
            </p>
            <button>Registrar ciclo</button>
          </fieldset>
        </form>
      </details>
      <h3>Consumo por empresa</h3>
      {data.companies.map((c: any) => (
        <details key={c.id}>
          <summary>{c.name}</summary>
          <Usage usage={c.usage} />
        </details>
      ))}
      <details>
        <summary>Auditoria do atendimento compartilhado</summary>
        {data.consumption.map((c: any) => (
          <p key={c.cycle_id + c.ticket_id}>
            Ticket {c.public_code} · ciclo {c.cycle_id} ·{" "}
            {new Date(c.created_at).toLocaleString("pt-BR")}
          </p>
        ))}
        {data.configuration_history?.map((a: any) => (
          <details key={a.id}>
            <summary>
              {new Date(a.created_at).toLocaleString("pt-BR")} ·{" "}
              {a.entity === "assisted_policy"
                ? "Horário compartilhado"
                : "Limite da versão"}
            </summary>
            <p>Autor: {a.actor_id || "Preparação local"}</p>
            {a.entity === "assisted_plan_policy" ? (
              <p>
                Limite anterior: {a.before_value?.included ?? "Pendente"} →
                atual: {a.after_value?.included ?? "Pendente"}. Aviso a partir
                de {a.after_value?.warning_at ?? "pendente"}.
              </p>
            ) : (
              <p>
                {a.after_value?.active ? "Ativo" : "Inativo"} ·{" "}
                {supportModes[a.after_value?.availability_mode || "scheduled"]}{" "}
                · {a.after_value?.timezone} ·{" "}
                {a.after_value?.hours?.length || 0} intervalos semanais.
              </p>
            )}
          </details>
        ))}
        {data.audit.map((a: any, i: number) => (
          <p key={i}>
            {new Date(a.created_at).toLocaleString("pt-BR")} · {a.entity_table}{" "}
            · {a.action} · {a.changed_fields.join(", ")}
          </p>
        ))}
      </details>
    </>
  );
}
