import { useEffect, useRef, type ReactNode } from "react";
// Native modal provides focus containment, Escape and background inertness.
export function Dialog({
  title,
  close,
  children,
  className = "",
}: {
  title: string;
  close: () => void;
  children: ReactNode;
  className?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    onClose = useRef(close),
    previous = useRef(document.activeElement as HTMLElement | null);
  onClose.current = close;
  useEffect(() => {
    const dialog = ref.current;
    dialog?.showModal();
    return () => {
      dialog?.close();
      queueMicrotask(() => previous.current?.focus());
    };
  }, []);
  return (
    <dialog
      className={"ds-dialog " + className}
      aria-label={title}
      ref={ref}
      onCancel={(e) => {
        e.preventDefault();
        onClose.current();
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) {
          const r = e.currentTarget.getBoundingClientRect();
          if (
            e.clientX < r.left ||
            e.clientX > r.right ||
            e.clientY < r.top ||
            e.clientY > r.bottom
          )
            onClose.current();
        }
      }}
    >
      <div className="ds-dialog-top">
        <strong>{title}</strong>
        <button aria-label="Fechar" onClick={close} type="button">
          ✕
        </button>
      </div>
      {children}
    </dialog>
  );
}
