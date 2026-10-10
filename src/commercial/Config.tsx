import { useState, useEffect } from "react";
import { rpc } from "../api";
import { kinds, reasons, errorMessage } from "./model";
export function CommercialConfig({
  org,
  onChange,
}: {
  org: string;
  onChange: () => Promise<void>;
}) {
  const [data, setData] = useState<any>(),
    [form, setForm] = useState<any>(),
    [error, setError] = useState(""),
    [saved, setSaved] = useState(""),
    [busy, setBusy] = useState(false),
    [rule, setRule] = useState<any>({
      service_id: "",
      kind: "",
      enabled: true,
      interval_minutes: "",
      max_attempts: "",
    });
  async function load() {
    try {
      const d: any = await rpc("commercial_config", { p_org: org });
      setData(d);
      setForm({
        ...d.settings,
        loss_reasons: d.settings.loss_reasons.join(", "),
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  useEffect(() => {
    void load();
  }, [org]);
  const update = (k: string, v: any) => setForm((x: any) => ({ ...x, [k]: v }));
  const number = (v: any) => (v == null || v === "" ? null : Number(v));
  async function save() {
    setBusy(true);
    setError("");
    try {
      const { revision, organization_id, created_at, updated_at, ...rest } =
        form;
      await rpc("commercial_config_save", {
        p_org: org,
        p_revision: revision,
        p_data: {
          ...rest,
          interval_minutes: number(form.interval_minutes),
          max_attempts: number(form.max_attempts),
          loss_reasons: form.loss_reasons
            .split(",")
            .map((x: string) => x.trim())
            .filter(Boolean),
        },
      });
      await load();
      await onChange();
      setSaved(
        "Configuração comercial salva. Históricos realizados foram preservados.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  async function saveRule() {
    setBusy(true);
    setError("");
    try {
      await rpc("commercial_rule_save", {
        p_org: org,
        p_id: rule.id || null,
        p_revision: rule.revision || 0,
        p_data: {
          service_id: rule.service_id || null,
          kind: rule.kind || null,
          enabled: rule.enabled,
          interval_minutes: number(rule.interval_minutes),
          max_attempts: number(rule.max_attempts),
        },
      });
      setRule({
        service_id: "",
        kind: "",
        enabled: true,
        interval_minutes: "",
        max_attempts: "",
      });
      await load();
      await onChange();
      setSaved("Regra salva. Regra específica → serviço → empresa → padrão.");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  if (!form)
    return (
      <section className="co-config">
        <p>{error || "Carregando configuração…"}</p>
      </section>
    );
  return (
    <section className="co-config">
      <h2>Configuração de recuperação</h2>
      <p>
        Organize o trabalho humano. Nenhuma mensagem é enviada automaticamente.
      </p>
      {error && <p role="alert">{error}</p>}
      {saved && <p role="status">{saved}</p>}
      <label className="co-check">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => update("enabled", e.target.checked)}
        />
        Habilitar recuperação
      </label>
      <div className="co-fields">
        <label>
          Intervalo da empresa (minutos)
          <input
            type="number"
            min="1"
            max="525600"
            value={form.interval_minutes ?? ""}
            placeholder="Padrão: 1440"
            onChange={(e) => update("interval_minutes", e.target.value)}
          />
        </label>
        <label>
          Máximo de tentativas
          <input
            type="number"
            min="1"
            max="10"
            value={form.max_attempts ?? ""}
            placeholder="Padrão seguro: 2"
            onChange={(e) => update("max_attempts", e.target.value)}
          />
        </label>
        <label>
          Após o limite
          <select
            value={form.after_limit}
            onChange={(e) => update("after_limit", e.target.value)}
          >
            <option value="stop">Encerrar sem resposta</option>
            <option value="lose">Registrar perda por falta de resposta</option>
          </select>
        </label>
        <label>
          Converter novos interesses quando
          <select
            value={form.conversion_criterion}
            onChange={(e) => update("conversion_criterion", e.target.value)}
          >
            <option value="booking">Agendamento confirmado</option>
            <option value="approval">Orçamento aprovado</option>
          </select>
        </label>
      </div>
      <div className="co-actions">
        <span>Intervalos sugeridos:</span>
        {[2, 6, 24, 48].map((h) => (
          <button key={h} onClick={() => update("interval_minutes", h * 60)}>
            {h} horas
          </button>
        ))}
        <button
          onClick={() => {
            update("interval_minutes", null);
            update("max_attempts", null);
          }}
        >
          Usar padrões
        </button>
      </div>
      <fieldset>
        <legend>Tipos elegíveis</legend>
        {Object.entries(kinds).map(([k, label]) => (
          <label className="co-check" key={k}>
            <input
              type="checkbox"
              checked={form.eligible_types.includes(k)}
              onChange={(e) =>
                update(
                  "eligible_types",
                  e.target.checked
                    ? [...form.eligible_types, k]
                    : form.eligible_types.filter((x: string) => x !== k),
                )
              }
            />
            {label}
          </label>
        ))}
      </fieldset>
      <fieldset>
        <legend>Horários de contato no fuso da empresa</legend>
        <label className="co-check">
          <input
            type="checkbox"
            checked={form.contact_hours == null}
            onChange={(e) =>
              update("contact_hours", e.target.checked ? null : [])
            }
          />
          Usar horário de atendimento da empresa (Manual publicado, quando houver)
        </label>
        {form.contact_hours != null &&
          [
            "Domingo",
            "Segunda",
            "Terça",
            "Quarta",
            "Quinta",
            "Sexta",
            "Sábado",
          ].map((label, day) => {
            const h = form.contact_hours.find((x: any) => x.day === day);
            const change = (patch: any) =>
              update(
                "contact_hours",
                form.contact_hours.map((x: any) =>
                  x.day === day ? { ...x, ...patch } : x,
                ),
              );
            return (
              <div className="co-hour" key={day}>
                <label className="co-check">
                  <input
                    type="checkbox"
                    checked={!!h}
                    onChange={(e) =>
                      update(
                        "contact_hours",
                        e.target.checked
                          ? [
                              ...form.contact_hours,
                              { day, open: "08:00", close: "18:00" },
                            ]
                          : form.contact_hours.filter(
                              (x: any) => x.day !== day,
                            ),
                      )
                    }
                  />
                  {label}
                </label>
                {h && (
                  <>
                    <input
                      aria-label={"Abertura " + label}
                      type="time"
                      value={h.open}
                      onChange={(e) => change({ open: e.target.value })}
                    />
                    <input
                      aria-label={"Fechamento " + label}
                      type="time"
                      value={h.close}
                      onChange={(e) => change({ close: e.target.value })}
                    />
                  </>
                )}
              </div>
            );
          })}
        <p>
          Sem dias habilitados, não há contato permitido. Janela não atravessa a
          meia-noite.
        </p>
      </fieldset>
      <label>
        Motivos de perda (códigos separados por vírgula)
        <input
          value={form.loss_reasons}
          onChange={(e) => update("loss_reasons", e.target.value)}
        />
      </label>
      <small>
        Use letras minúsculas, números e sublinhado; até 30 motivos.{" "}
        {Object.values(reasons).join(" · ")}.
      </small>
      <button className="primary" disabled={busy} onClick={() => void save()}>
        Salvar configuração comercial
      </button>
      <h3>Regras por serviço ou tipo de retorno</h3>
      <p>
        Regra específica prevalece sobre serviço; campo vazio herda o nível
        seguinte.
      </p>
      <div className="co-fields">
        <label>
          Serviço da regra
          <select
            value={rule.service_id || ""}
            onChange={(e) => setRule({ ...rule, service_id: e.target.value })}
          >
            <option value="">Todos os serviços</option>
            {data.services.map((x: any) => (
              <option value={x.id} key={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Tipo da regra
          <select
            value={rule.kind || ""}
            onChange={(e) => setRule({ ...rule, kind: e.target.value })}
          >
            <option value="">Regra geral do serviço</option>
            {Object.entries(kinds).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          Intervalo da regra (minutos)
          <input
            type="number"
            min="1"
            max="525600"
            value={rule.interval_minutes ?? ""}
            onChange={(e) =>
              setRule({ ...rule, interval_minutes: e.target.value })
            }
          />
        </label>
        <label>
          Tentativas da regra
          <input
            type="number"
            min="1"
            max="10"
            value={rule.max_attempts ?? ""}
            onChange={(e) => setRule({ ...rule, max_attempts: e.target.value })}
          />
        </label>
      </div>
      <label className="co-check">
        <input
          type="checkbox"
          checked={rule.enabled}
          onChange={(e) => setRule({ ...rule, enabled: e.target.checked })}
        />
        Regra ativa
      </label>
      <button
        disabled={busy || (!rule.service_id && !rule.kind)}
        onClick={() => void saveRule()}
      >
        {rule.id ? "Salvar regra revisada" : "Adicionar regra"}
      </button>
      {data.rules.map((r: any) => (
        <div className="co-history" key={r.id}>
          <b>
            {data.services.find((s: any) => s.id === r.service_id)?.name ||
              "Todos os serviços"}{" "}
            · {kinds[r.kind] || "Regra geral"}
          </b>
          <p>
            {r.interval_minutes ?? "Herdado"} min ·{" "}
            {r.max_attempts ?? "Herdado"} tentativas ·{" "}
            {r.enabled ? "Ativa" : "Desativada"}
          </p>
          <button onClick={() => setRule({ ...r })}>Editar regra</button>
        </div>
      ))}
    </section>
  );
}
