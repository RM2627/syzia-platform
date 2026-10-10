import { useEffect, useState } from "react";
import { rpc } from "../api";
import type { Session } from "@supabase/supabase-js";
export function IdleSession({
  session,
  onLogout,
}: {
  session: Session | null;
  onLogout: () => void;
}) {
  const [remaining, setRemaining] = useState<number | null>(null);
  let sid = "";
  try {
    sid =
      JSON.parse(
        atob(
          (session?.access_token.split(".")[1] || "")
            .replace(/-/g, "+")
            .replace(/_/g, "/"),
        ),
      ).session_id || "";
  } catch {}
  const identity =
    session && !session.user.is_anonymous ? session.user.id + ":" + sid : "";
  useEffect(() => {
    if (!identity) {
      setRemaining(null);
      return;
    }
    let dead = false,
      ending = false,
      last = 0,
      idle = 1800,
      warning = 60,
      pending = false,
      sent = 0;
    const key = "vireloq.activity:" + identity;
    const finish = () => {
      if (ending || dead) return;
      ending = true;
      localStorage.removeItem(key);
      onLogout();
    };
    const sync = async (activity = false) => {
      if (pending || ending) return;
      pending = true;
      try {
        const status = await rpc<any>("access_session", {
          p_activity: activity,
        });
        if (dead) return;
        idle = status.idle_seconds;
        warning = status.warning_seconds;
        last = status.last_activity
          ? Date.parse(status.last_activity)
          : last || Date.now();
        localStorage.setItem(key, String(last));
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (!dead && code === "42501") finish();
        else if (!last) last = Date.now();
      } finally {
        pending = false;
      }
    };
    void sync();
    const human = (event: Event) => {
      if (!event.isTrusted) return;
      if (last && Date.now() - last >= idle * 1000) {
        finish();
        return;
      }
      if (Date.now() - sent > 5000) {
        sent = Date.now();
        void sync(true);
      }
    };
    const storage = (event: StorageEvent) => {
      if (event.key !== key) return;
      if (event.newValue === null) {
        finish();
        return;
      }
      const value = Number(event.newValue);
      if (Number.isFinite(value) && value > last && value <= Date.now() + 1000)
        last = value;
    };
    window.addEventListener("pointerdown", human, { passive: true });
    window.addEventListener("keydown", human);
    window.addEventListener("storage", storage);
    const interval = setInterval(() => {
      if (!last) return;
      const left = Math.ceil(idle - (Date.now() - last) / 1000);
      if (left <= 0) finish();
      else setRemaining(left <= warning ? left : null);
    }, 1000);
    return () => {
      dead = true;
      clearInterval(interval);
      window.removeEventListener("pointerdown", human);
      window.removeEventListener("keydown", human);
      window.removeEventListener("storage", storage);
    };
  }, [identity]);
  return remaining === null ? null : (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-label="Sessão prestes a expirar"
      className="idle-warning"
    >
      <strong>Sua sessão está prestes a expirar por inatividade.</strong>
      <p>Você será desconectado em {remaining} segundos.</p>
      <button
        className="primary"
        onClick={async () => {
          try {
            await rpc("access_session", { p_activity: true });
            localStorage.setItem(
              "vireloq.activity:" + identity,
              String(Date.now()),
            );
            window.dispatchEvent(
              new StorageEvent("storage", {
                key: "vireloq.activity:" + identity,
                newValue: String(Date.now()),
              }),
            );
            setRemaining(null);
          } catch {
            onLogout();
          }
        }}
      >
        Continuar conectado
      </button>
    </div>
  );
}
