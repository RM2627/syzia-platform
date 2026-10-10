import { useId, useState, type ReactNode } from "react";
export function SortableList<T extends { id: string; name: string }>({
  items,
  onChange,
  disabled = false,
  label,
  render,
}: {
  items: T[];
  onChange: (items: T[]) => void;
  disabled?: boolean;
  label: string;
  render?: (item: T) => ReactNode;
}) {
  const id = useId(),
    [moving, setMoving] = useState<string | null>(null),
    [notice, setNotice] = useState("");
  function move(from: number, to: number) {
    if (disabled || from < 0 || to < 0 || to >= items.length || from === to)
      return;
    const next = [...items];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
    setNotice(item.name + " movido para a posição " + (to + 1));
  }
  return (
    <div className="sortable">
      <p id={id} className="muted">
        Arraste pela alça ou use os botões para mudar a ordem.
      </p>
      <ol aria-label={label} aria-describedby={id}>
        {items.map((item, i) => (
          <li
            key={item.id}
            onDragOver={(e) => {
              if (!disabled) e.preventDefault();
            }}
            onDrop={(e) => {
              e.preventDefault();
              if (moving)
                move(
                  items.findIndex((x) => x.id === moving),
                  i,
                );
              setMoving(null);
            }}
          >
            <span
              className="sort-handle"
              draggable={!disabled}
              onDragStart={(e) => {
                setMoving(item.id);
                e.dataTransfer.setData("text/plain", item.id);
              }}
              onDragEnd={() => setMoving(null)}
              aria-hidden="true"
            >
              ⠿
            </span>
            <span className="sort-name">
              {render ? render(item) : item.name}
            </span>
            <div className="sort-buttons">
              <button
                type="button"
                aria-label={"Subir " + item.name}
                disabled={disabled || i === 0}
                onClick={() => move(i, i - 1)}
              >
                ↑
              </button>
              <button
                type="button"
                aria-label={"Descer " + item.name}
                disabled={disabled || i === items.length - 1}
                onClick={() => move(i, i + 1)}
              >
                ↓
              </button>
            </div>
          </li>
        ))}
      </ol>
      <span role="status" className="sr-only">
        {notice}
      </span>
    </div>
  );
}
