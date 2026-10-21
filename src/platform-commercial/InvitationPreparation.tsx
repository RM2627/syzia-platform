import { useRef } from "react";
import { rpc } from "../api";

// Authorization belongs to invitation preparation, never to preregistration.
export function InvitationPreparation({
  contact,
  purpose,
  busy,
  act,
}: {
  contact: any;
  purpose: string;
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const key = useRef(crypto.randomUUID());
  return (
    <details>
      <summary>Preparar contato para este convite</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const email = String(
            new FormData(e.currentTarget).get("email") || "",
          );
          void act(async () => {
            await rpc("commercial_contact_save", {
              p_id: contact.id,
              p_revision: contact.revision,
              p_key: key.current,
              p_data: { email },
            });
          });
        }}
      >
        <label>
          E-mail do destinatário
          <input
            name="email"
            type="email"
            required
            maxLength={254}
            defaultValue={contact.email || ""}
            onChange={() => {
              key.current = crypto.randomUUID();
            }}
          />
        </label>
        <p>
          Alterar o endereço exige uma nova autorização. Os registros anteriores
          permanecem no histórico.
        </p>
        <button disabled={busy}>Salvar e-mail</button>
      </form>
      {purpose === "activation" &&
        !["wants_trial", "activation_sent", "registration_started"].includes(
          contact.stage,
        ) && (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void act(async () => {
                await rpc("commercial_contact_save", {
                  p_id: contact.id,
                  p_revision: contact.revision,
                  p_key: crypto.randomUUID(),
                  p_data: { stage: "wants_trial" },
                });
              });
            }}
          >
            <label>
              <input type="checkbox" required /> O interessado manifestou que
              deseja testar a SYZIA.
            </label>
            <button disabled={busy}>Registrar interesse em testar</button>
          </form>
        )}
      {contact.email && !contact.suppressed && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            void act(async () => {
              await rpc("commercial_contact_authorize", {
                p_id: contact.id,
                p_purpose: purpose,
                p_authorized: true,
                p_notice: f.get("notice"),
                p_evidence: f.get("evidence"),
                p_expires: new Date(String(f.get("expires"))).toISOString(),
              });
            });
          }}
        >
          <h3>
            Autorização para{" "}
            {purpose === "activation" ? "ativação" : "demonstração"}
          </h3>
          <p>
            Registre uma autorização realmente obtida para este endereço e
            finalidade. Este registro não envia o convite.
          </p>
          <label>
            Versão do aviso informado
            <input name="notice" required maxLength={80} />
          </label>
          <label>
            Evidência da autorização
            <textarea name="evidence" required minLength={10} maxLength={500} />
          </label>
          <label>
            Válida até
            <input name="expires" type="datetime-local" required />
          </label>
          <label>
            <input type="checkbox" required /> O contato autorizou esta
            finalidade.
          </label>
          <button disabled={busy}>Registrar autorização</button>
        </form>
      )}
    </details>
  );
}
