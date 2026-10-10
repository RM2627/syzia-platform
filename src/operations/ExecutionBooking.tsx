import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { rpc, errorMessage } from "../api";
import {
  ExecutionSchedule,
  type Period,
} from "../scheduling/ExecutionSchedule";
export function ExecutionBooking({
  org,
  code,
  appointment,
  minutes,
}: {
  org: string;
  code: string;
  appointment?: any;
  minutes?: number;
}) {
  const [start, setStart] = useState(""),
    [periods, setPeriods] = useState<Period[]>([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const navigate = useNavigate();
  return (
    <section className="card">
      <h2>
        {appointment
          ? "Replanejar atendimento completo"
          : "Concluir agendamento"}
      </h2>
      <p>
        {appointment
          ? "Todos os períodos serão substituídos juntos, somente após validar a nova combinação."
          : "A proposta aprovada permanece vinculada a este pedido."}
      </p>
      <ExecutionSchedule
        value={start}
        periods={periods}
        minutes={minutes}
        disabled={busy}
        onChange={(v, p) => {
          setStart(v);
          setPeriods(p);
        }}
        load={(day, next) =>
          rpc("operations_execution_options", {
            p_org: org,
            p_code: code,
            p_day: day,
            p_next: next,
          })
        }
      />
      {error && <p role="alert">{error}</p>}
      {start && (
        <button
          className="primary"
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            setError("");
            try {
              const r = await rpc<any>("operations_book_execution", {
                p_org: org,
                p_code: code,
                p_start: start,
                p_previous: appointment?.public_code || null,
                p_revision: appointment?.revision || null,
                p_periods: periods,
                p_key: crypto.randomUUID(),
              });
              navigate("/painel/" + org + "/agenda?ficha=" + r.id);
            } catch (e) {
              setError(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}
        >
          {appointment
            ? "Confirmar replanejamento completo"
            : "Confirmar todos os períodos"}
        </button>
      )}
    </section>
  );
}
