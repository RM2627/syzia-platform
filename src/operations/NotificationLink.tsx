import { useRef, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { rpc } from "../api";

export function NotificationLink({
  org,
  notification,
  children,
}: {
  org: string;
  notification: { id: string; href: string; read: boolean };
  children: ReactNode;
}) {
  const sent = useRef(false);
  return (
    <Link
      className="op-attention"
      to={notification.href}
      onClick={() => {
        if (notification.read || sent.current) return;
        sent.current = true;
        // Navigation remains available if saving the read fails. No optimistic
        // persisted state: the next read reflects the server's per-user result.
        void rpc("operations_read_notification", {
          p_org: org,
          p_id: notification.id,
        }).catch(() => {
          sent.current = false;
        });
      }}
    >
      {children}
    </Link>
  );
}
