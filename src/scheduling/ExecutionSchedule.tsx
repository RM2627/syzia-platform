import "./execution.css";
import { useRef, useState } from "react";
import { date, time, message } from "../consumer/api";
export type Period = {
  start: string;
  end: string;
  minutes: number;
  reserved_until: string;
};
export type ExecutionOptions = {
  slots: string[];
  plans: { start: string; periods: Period[] }[];
  duration_minutes: number;
  execution_mode: string;
  reason?: string;
  day: string;
};
export function duration(minutes: number | null | undefined) {
  if (!minutes) return "A definir";
  const h = Math.floor(minutes / 60),
    m = minutes % 60;
  return h ? `${h}h${m ? String(m).padStart(2, "0") : ""}` : `${m} min`;
}
export function Periods({ periods }: { periods: Period[] }) {
  return (
    <ol className="execution-periods" aria-label="Períodos do atendimento">
      {periods.map((p, i) => (
        <li key={p.start}>
          <strong>Parte {i + 1}</strong> · {date(p.start)} — {time(p.end)}{" "}
          <small>({duration(p.minutes)})</small>
        </li>
      ))}
    </ol>
  );
}
export function ExecutionSchedule({
  load,
  value,
  onChange,
  disabled = false,
  minutes,
  periods = [],
  label = "Escolha um dia",
  initialDay = "",
}: {
  load: (day: string, next: boolean) => Promise<ExecutionOptions>;
  value: string;
  onChange: (start: string, periods: Period[]) => void;
  disabled?: boolean;
  minutes?: number;
  periods?: Period[];
  label?: string;
  initialDay?: string;
}) {
  const [day, setDay] = useState(value.slice(0, 10) || initialDay.slice(0, 10)),
    [result, setResult] = useState<ExecutionOptions>(),
    [state, setState] = useState("idle"),
    [error, setError] = useState("");
  const generation = useRef(0);
  async function query(next = false) {
    const g = ++generation.current;
    setState("loading");
    setError("");
    setResult(undefined);
    onChange("", []);
    try {
      let d = day || new Date().toISOString().slice(0, 10);
      if (next) {
        const n = new Date(d + "T12:00Z");
        n.setUTCDate(n.getUTCDate() + 1);
        d = n.toISOString().slice(0, 10);
      }
      const r = await load(d, next);
      if (g !== generation.current) return;
      setResult(r);
      setDay(r.day);
      setState("done");
    } catch (e) {
      if (g === generation.current) {
        setError(message(e));
        setState("error");
      }
    }
  }
  const total = result?.duration_minutes || minutes;
  return (
    <section className="c-journey-schedule execution-schedule">
      {total ? (
        <p>
          <strong>Duração estimada deste atendimento: {duration(total)}</strong>
          <br />
          Os horários disponíveis consideram o tempo necessário para realizar
          todos os serviços.
        </p>
      ) : null}
      {result?.execution_mode === "split" && (
        <p>
          Este serviço permite vários períodos. Confira todas as partes antes de
          confirmar.
        </p>
      )}
      <label>
        {label}
        <input
          type="date"
          value={day}
          min={new Date().toISOString().slice(0, 10)}
          disabled={disabled || state === "loading"}
          onChange={(e) => {
            generation.current++;
            setDay(e.target.value);
            setResult(undefined);
            setState("idle");
            onChange("", []);
          }}
        />
      </label>
      <button
        type="button"
        disabled={disabled || !day || state === "loading"}
        onClick={() => void query()}
      >
        Consultar disponibilidade
      </button>
      {state === "loading" && (
        <p role="status">Buscando horários compatíveis…</p>
      )}
      {error && (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={() => void query()}>
            Tentar novamente
          </button>
        </p>
      )}
      {state === "done" && !result?.plans.length && (
        <div role="status">
          <p>
            {result?.reason === "does_not_fit"
              ? `Este atendimento precisa de aproximadamente ${duration(total)} e não cabe no expediente deste dia. Escolha outra data.`
              : result?.reason === "closed"
                ? "A empresa não atende neste dia."
                : "Não há capacidade disponível neste dia para concluir este atendimento."}
          </p>
          <button
            type="button"
            disabled={disabled}
            onClick={() => void query(true)}
          >
            Ver próximos horários compatíveis
          </button>
        </div>
      )}
      <div className="c-slots" role="group" aria-label="Horários disponíveis">
        {result?.plans.map((p) => (
          <button
            type="button"
            key={p.start}
            aria-pressed={value === p.start}
            onClick={() => onChange(p.start, p.periods)}
          >
            {time(p.start)}
            {p.periods.length > 1 ? ` · ${p.periods.length} períodos` : ""}
          </button>
        ))}
      </div>
      {value && (
        <div className="execution-chosen">
          <p>
            Início escolhido: <strong>{date(value)}</strong>
          </p>
          {periods.length > 1 && <Periods periods={periods} />}
        </div>
      )}
    </section>
  );
}
