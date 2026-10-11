import { useEffect, useId, useRef, useState } from "react";
import { formatPhone, normalizePhone } from "./phone";
export function PhoneField({
  label,
  value,
  onChange,
  required = true,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  required?: boolean;
}) {
  const id = useId(),
    ref = useRef<HTMLInputElement>(null);
  const [touched, setTouched] = useState(false);
  const invalid = Boolean(value.trim()) && normalizePhone(value) === null;
  useEffect(() => {
    ref.current?.setCustomValidity(
      invalid
        ? "Informe um telefone válido com DDD. Ex.: (87) 98765-4321."
        : "",
    );
  }, [invalid]);
  return (
    <div className="phone-field">
      <label htmlFor={id}>{label}</label>
      <input
        ref={ref}
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel"
        required={required}
        maxLength={40}
        value={value}
        aria-describedby={id + "-help"}
        aria-invalid={touched && invalid}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => {
          setTouched(true);
          onChange(formatPhone(value));
        }}
      />
      <small id={id + "-help"}>
        A empresa poderá usar este telefone para contato relacionado à
        solicitação. Use DDD; para outro país, inclua + e o código
        internacional.
      </small>
      {touched && invalid && (
        <p role="alert">
          Confira o DDD e o número completo. Ex.: (87) 98765-4321.
        </p>
      )}
    </div>
  );
}
