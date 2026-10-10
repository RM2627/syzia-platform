import { useId, useState, type InputHTMLAttributes } from "react";
import "./password-input.css";
/** The actual input stays mounted, preserving autofill, selection and its value. */
export function PasswordInput(props: InputHTMLAttributes<HTMLInputElement>) {
  const [visible, setVisible] = useState(false);
  const generated = useId(),
    id = props.id || generated;
  return (
    <span className="password-input">
      <input {...props} id={id} type={visible ? "text" : "password"} />
      <button
        type="button"
        className="password-toggle"
        aria-label={visible ? "Ocultar senha" : "Mostrar senha"}
        aria-pressed={visible}
        aria-controls={id}
        disabled={props.disabled}
        onClick={() => setVisible((v) => !v)}
      >
        <svg
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.7"
          aria-hidden="true"
        >
          <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
          <circle cx="12" cy="12" r="3" />
          {visible && <path d="m3 3 18 18" />}
        </svg>
      </button>
    </span>
  );
}
