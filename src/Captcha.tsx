import { demoBuild } from "./demo/transport";
import { useEffect, useRef, useState } from "react";
export const captchaConfigured = !demoBuild && Boolean(
  import.meta.env.VITE_TURNSTILE_SITE_KEY,
);
type Turnstile = {
  render: (el: HTMLElement, options: Record<string, unknown>) => string;
  remove: (id: string) => void;
};
declare global {
  interface Window {
    turnstile?: Turnstile;
  }
}
let loading: Promise<void> | undefined;
function load() {
  return (loading ??= new Promise((resolve, reject) => {
    if (window.turnstile) {
      resolve();
      return;
    }
    const s = document.createElement("script");
    s.src =
      "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => {
      loading = undefined;
      reject(Error("captcha_unavailable"));
    };
    document.head.appendChild(s);
  }));
}
export function Captcha({ onToken }: { onToken: (token: string) => void }) {
  const box = useRef<HTMLDivElement>(null),
    callback = useRef(onToken),
    [error, setError] = useState(false);
  callback.current = onToken;
  useEffect(() => {
    if (!captchaConfigured) return;
    let cancelled = false,
      id: string | undefined;
    load()
      .then(() => {
        if (cancelled || !box.current) return;
        id = window.turnstile!.render(box.current, {
          sitekey: import.meta.env.VITE_TURNSTILE_SITE_KEY,
          language: "pt-br",
          callback: (token: string) => callback.current(token),
          "expired-callback": () => callback.current(""),
          "error-callback": () => {
            callback.current("");
            setError(true);
          },
        });
      })
      .catch(() => setError(true));
    return () => {
      cancelled = true;
      if (id) window.turnstile?.remove(id);
    };
  }, []);
  return captchaConfigured ? (
    <div>
      <div ref={box} />
      {error && (
        <p role="alert">
          Não foi possível carregar a verificação. Confira a conexão e
          recarregue a página.
        </p>
      )}
    </div>
  ) : null;
}
