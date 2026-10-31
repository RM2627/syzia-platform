import { useEffect, useRef, useState } from "react";
export type AcademyTheme = "light" | "dark";
const key = "syzia.academy.theme";
const stored = (): AcademyTheme | null => {
  try {
    const v = localStorage.getItem(key);
    return v === "dark" || v === "light" ? v : null;
  } catch {
    return null;
  }
};
const system = (): AcademyTheme =>
  matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
export function useAcademyTheme() {
  const manual = useRef<AcademyTheme | null>(stored());
  const [theme, setTheme] = useState<AcademyTheme>(
    () => manual.current || system(),
  );
  useEffect(() => {
    const apply = (v: AcademyTheme) => {
      document.documentElement.dataset.academyTheme = v;
      setTheme(v);
    };
    const media = matchMedia("(prefers-color-scheme: dark)");
    const changed = () => {
      if (!manual.current) apply(system());
    };
    const storage = (e: StorageEvent) => {
      if (e.key === key || e.key === null) {
        manual.current = stored();
        apply(manual.current || system());
      }
    };
    apply(manual.current || system());
    media.addEventListener("change", changed);
    addEventListener("storage", storage);
    return () => {
      media.removeEventListener("change", changed);
      removeEventListener("storage", storage);
      delete document.documentElement.dataset.academyTheme;
    };
  }, []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    manual.current = next;
    try {
      localStorage.setItem(key, next);
    } catch {
      /* Storage blocked: retain choice for this visit. */
    }
    document.documentElement.dataset.academyTheme = next;
    setTheme(next);
  };
  return { theme, toggle };
}
export function ThemeToggle({
  theme,
  toggle,
}: {
  theme: AcademyTheme;
  toggle: () => void;
}) {
  const label = theme === "dark" ? "Ativar modo claro" : "Ativar modo escuro";
  return (
    <button
      type="button"
      className="ac-theme-toggle"
      onClick={toggle}
      aria-label={label}
      title={label}
    >
      <svg
        aria-hidden="true"
        focusable="false"
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {theme === "dark" ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
          </>
        ) : (
          <path d="M20.9 13.1A9 9 0 0 1 10.9 3.1a9 9 0 1 0 10 10Z" />
        )}
      </svg>
    </button>
  );
}
