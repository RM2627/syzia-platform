import { useState } from "react";
export type ServiceChecklistModel = {
  revision: number;
  items: { id: string | null; title: string }[];
};
export function ServiceChecklistEditor({
  model,
  change,
  error,
  retry,
}: {
  model?: ServiceChecklistModel;
  change: (model: ServiceChecklistModel) => void;
  error: string;
  retry: () => void;
}) {
  const [title, setTitle] = useState("");
  function move(index: number, offset: number) {
    if (!model) return;
    const items = [...model.items];
    [items[index], items[index + offset]] = [
      items[index + offset],
      items[index],
    ];
    change({ ...model, items });
  }
  return (
    <section
      className="service-checklist-editor"
      aria-label="Checklist padrão de execução"
    >
      <h3>
        Checklist padrão de execução <small>· Opcional</small>
      </h3>
      <p>
        Etapas para orientar sua equipe. Cada novo agendamento recebe uma cópia;
        editar este modelo não altera fichas já criadas.
      </p>
      {error ? (
        <p role="alert">
          {error}{" "}
          <button type="button" onClick={retry}>
            Carregar modelo novamente
          </button>
        </p>
      ) : !model ? (
        <p role="status">Carregando modelo…</p>
      ) : (
        <>
          {!model.items.length && (
            <p>
              Sem etapas padrão. O serviço pode ser salvo e utilizado
              normalmente.
            </p>
          )}
          <ol>
            {model.items.map((item, index) => (
              <li key={item.id || `new-${index}`}>
                <label>
                  Etapa {index + 1}
                  <input
                    maxLength={200}
                    required
                    value={item.title}
                    onChange={(e) =>
                      change({
                        ...model,
                        items: model.items.map((v, n) =>
                          n === index ? { ...v, title: e.target.value } : v,
                        ),
                      })
                    }
                  />
                </label>
                <div className="checklist-order-actions">
                  <button
                    type="button"
                    disabled={index === 0}
                    aria-label={`Mover etapa ${index + 1} para cima`}
                    onClick={() => move(index, -1)}
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    disabled={index === model.items.length - 1}
                    aria-label={`Mover etapa ${index + 1} para baixo`}
                    onClick={() => move(index, 1)}
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    aria-label={`Remover etapa ${index + 1} do modelo`}
                    onClick={() =>
                      change({
                        ...model,
                        items: model.items.filter((_, n) => n !== index),
                      })
                    }
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ol>
          <label>
            Nova etapa do modelo
            <input
              maxLength={200}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  if (title.trim() && model.items.length < 100) {
                    change({
                      ...model,
                      items: [
                        ...model.items,
                        { id: null, title: title.trim() },
                      ],
                    });
                    setTitle("");
                  }
                }
              }}
            />
          </label>
          <button
            type="button"
            disabled={!title.trim() || model.items.length >= 100}
            onClick={() => {
              change({
                ...model,
                items: [...model.items, { id: null, title: title.trim() }],
              });
              setTitle("");
            }}
          >
            Adicionar ao modelo
          </button>
          <small>
            As alterações do modelo são gravadas junto com o serviço. Até 100
            etapas.
          </small>
        </>
      )}
    </section>
  );
}
