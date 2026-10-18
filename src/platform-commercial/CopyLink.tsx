import { useState } from "react";
export function CopyLink({
  url,
  label = "Copiar link da demonstração",
}: {
  url: string;
  label?: string;
}) {
  const [notice, setNotice] = useState("");
  return (
    <div>
      <label>
        Link de acesso
        <input value={url} readOnly onFocus={(e) => e.currentTarget.select()} />
      </label>
      <button
        type="button"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setNotice(
              "Link copiado. Você pode compartilhar pelo canal autorizado.",
            );
          } catch {
            setNotice("Selecione o endereço acima e copie para compartilhar.");
          }
        }}
      >
        {label}
      </button>
      <p role="status">{notice}</p>
    </div>
  );
}
