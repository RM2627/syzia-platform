import { useEffect, useRef, useState, type SetStateAction } from "react";
/** Memory-only draft. Caller must be keyed by authenticated user + organization.
 * A server revision never overwrites dirty input; saving retains optimistic concurrency.
 * No passwords, cross-account storage or localStorage draft copies.
 */
export function useDraft<T, R extends number | string = number>(
  incoming: T,
  serverRevision: R,
) {
  const latest = useRef(incoming);
  latest.current = incoming;
  const [value, setValue] = useState(incoming);
  const [revision, setRevision] = useState(serverRevision);
  const [dirty, setDirty] = useState(false);
  useEffect(() => {
    if (!dirty) {
      setValue(latest.current);
      setRevision(serverRevision);
    }
  }, [serverRevision, dirty]);
  return {
    value,
    revision,
    dirty,
    conflict: dirty && revision !== serverRevision,
    set: (next: SetStateAction<T>) => {
      setDirty(true);
      setValue(next);
    },
    // A caller may acknowledge its own adjacent operation only after proving no intervening revision.
    advanceRevision: (from: R, to: R) =>
      setRevision((current) => (current === from ? to : current)),
    saved: () => setDirty(false),
    discard: () => {
      setValue(latest.current);
      setRevision(serverRevision);
      setDirty(false);
    },
  };
}
export function DraftConflict({
  conflict,
  discard,
}: {
  conflict: boolean;
  discard: () => void;
}) {
  if (!conflict) return null;
  return (
    <div role="alert" className="notice">
      <strong>Há uma atualização mais recente.</strong>
      <p>
        Seu rascunho foi preservado. Copie suas alterações antes de carregar a
        versão atual; o salvamento não substituirá dados de outra revisão.
      </p>
      <button
        type="button"
        onClick={() => {
          if (
            window.confirm(
              "Descartar este rascunho e carregar os dados atuais?",
            )
          )
            discard();
        }}
      >
        Descartar rascunho e carregar atualização
      </button>
    </div>
  );
}
