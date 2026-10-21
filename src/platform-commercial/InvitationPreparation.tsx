import { useRef } from "react";
import { rpc } from "../api";

// Complete only a missing destination. This never authorizes contact or changes interest.
export function InvitationPreparation({
  contact,
  busy,
  act,
}: {
  contact: { id: string; revision: number; email?: string | null };
  busy: boolean;
  act: (fn: () => Promise<void>) => Promise<void>;
}) {
  const key = useRef(crypto.randomUUID());
  if (contact.email) return null;
  return (
    <form
      className="invitation-email"
      onSubmit={(e) => {
        e.preventDefault();
        const email = String(new FormData(e.currentTarget).get("email") || "");
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
          autoComplete="email"
          onChange={() => {
            key.current = crypto.randomUUID();
          }}
        />
      </label>
      <button disabled={busy}>Adicionar e-mail</button>
    </form>
  );
}
