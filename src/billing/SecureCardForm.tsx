import { useEffect, useRef, useState } from "react";
import { billingApi, loadSDK } from "./checkout-api";
import { normalizePayerEmail } from "../../shared/billing-payer-email.mjs";
import {
  documentError,
  holderError,
  secureFieldErrors,
} from "./checkout-fields";
export function SecureCardForm({
  amount,
  onToken,
  busy,
  onPhase,
  checkout,
}: {
  amount: number;
  onToken: (token: string, payerEmail: string) => Promise<void>;
  busy: boolean;
  onPhase: (phase: string) => void;
  checkout: boolean;
}) {
  const [ready, setReady] = useState(false),
    [error, setError] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({}),
    [tokenizing, setTokenizing] = useState(false);
  const id = useRef("mp-" + crypto.randomUUID()),
    root = useRef<HTMLFormElement>(null);
  const submit = useRef(onToken),
    phase = useRef(onPhase),
    sending = useRef(false),
    blocked = useRef(busy);
  const fieldsErrors = useRef<Record<string, string>>({});
  const [payerEmail, setPayerEmail] = useState("");
  const emailTouched = useRef(false),
    confirmedEmail = useRef<string | null>(null),
    submittedEmail = useRef<string | null>(null);
  submit.current = onToken;
  phase.current = onPhase;
  blocked.current = busy;
  function fieldError(field: string, text: string) {
    fieldsErrors.current = { ...fieldsErrors.current, [field]: text };
    setErrors(fieldsErrors.current);
  }
  function localValidation() {
    const f = root.current;
    if (!f) return false;
    const input = (key: string) =>
      f.querySelector<HTMLInputElement>(`#${id.current}-${key}`)!;
    const name = input("cardholderName");
    name.value = name.value.trim().replace(/\s+/g, " ");
    fieldError("cardholderName", holderError(name.value));
    fieldError(
      "identificationNumber",
      documentError(
        input("identificationType").value,
        input("identificationNumber").value,
      ),
    );
    const email = normalizePayerEmail(input("cardholderEmail").value);
    fieldError("cardholderEmail", email ? "" : "Informe um e-mail válido.");
    const consent = f.querySelector<HTMLInputElement>('[name="consent"]')!;
    fieldError(
      "consent",
      consent.checked && email && confirmedEmail.current === email
        ? "" : "Confirme o e-mail e autorize as condições para continuar.",
    );
    const first = Object.entries(fieldsErrors.current).find(([, text]) => text);
    if (first) {
      f.querySelector<HTMLElement>(`#${id.current}-${first[0]}`)?.focus();
      setError("Revise os campos indicados antes de continuar.");
      return false;
    }
    return true;
  }
  useEffect(() => {
    let live = true,
      form: any;
    const formElement = root.current;
    void (async () => {
      const config = await billingApi("config", {});
      await loadSDK();
      if (!live) return;
      const emailInput = formElement?.querySelector<HTMLInputElement>(`#${id.current}-cardholderEmail`);
      const suggestion = normalizePayerEmail(config.payer_email_suggestion);
      if (emailInput && !emailTouched.current && !emailInput.value && suggestion) {
        emailInput.value = suggestion;
        setPayerEmail(suggestion);
      }
      const fields = [
        "cardNumber",
        "expirationDate",
        "securityCode",
        "cardholderName",
        "issuer",
        "installments",
        "identificationType",
        "identificationNumber",
        "cardholderEmail",
      ];
      const placeholders: Record<string, string> = {
        cardNumber: "0000 0000 0000 0000",
        expirationDate: "MM/AA",
        securityCode: "•••",
      };
      form = new (window as any).MercadoPago(config.public_key, {
        locale: "pt-BR",
      }).cardForm({
        amount: (amount / 100).toFixed(2),
        iframe: true,
        form: {
          id: id.current,
          ...Object.fromEntries(
            fields.map((k) => [
              k,
              {
                id: id.current + "-" + k,
                ...(placeholders[k]
                  ? {
                      placeholder: placeholders[k],
                      style: { fontSize: "16px", color: "#202536" },
                    }
                  : {}),
              },
            ]),
          ),
        },
        callbacks: {
          onFormMounted: (err: unknown) => {
            if (live) {
              setReady(!err);
              if (err)
                setError(
                  "Não foi possível abrir os campos seguros. Volte e tente novamente.",
                );
            }
          },
          onValidityChange: (err: unknown, field: string) => {
            if (!live || !Object.hasOwn(secureFieldErrors, field)) return;
            fieldError(
              field,
              Array.isArray(err) && err.length ? secureFieldErrors[field] : "",
            );
          },
          onFetching: (resource: string) => {
            if (live && resource === "cardToken") {
              setTokenizing(true);
              phase.current("Protegendo os dados do cartão…");
            }
            return () => {
              if (live && resource === "cardToken") {
                setTokenizing(false);
                phase.current("");
              }
            };
          },
          onSubmit: async (event: Event) => {
            event.preventDefault();
            if (
              !live ||
              sending.current ||
              blocked.current ||
              !localValidation()
            )
              return;
            sending.current = true;
            setError("");
            try {
              const data = form.getCardFormData();
              const token = data.token;
              const email = normalizePayerEmail(data.cardholderEmail);
              if (!email || email !== submittedEmail.current || email !== confirmedEmail.current) {
                setError("O e-mail mudou durante a confirmação. Confira o e-mail e confirme novamente.");
                return;
              }
              if (
                typeof token !== "string" ||
                !/^[a-zA-Z0-9_-]{16,200}$/.test(token)
              ) {
                setError(
                  "Não foi possível proteger os dados. Revise os campos e tente novamente.",
                );
                return;
              }
              await submit.current(token, email);
            } catch {
              if (live)
                setError(
                  "Não foi possível concluir a verificação do cartão. Revise os campos seguros.",
                );
            } finally {
              sending.current = false;
              submittedEmail.current = null;
              const hidden = formElement?.querySelector<HTMLInputElement>(
                'input[name="MPHiddenInputToken"]',
              );
              if (hidden) hidden.value = "";
            }
          },
          onError: () => {
            if (live) {
              setTokenizing(false);
              phase.current("");
              setError(
                "Confira os campos indicados. Se estiverem corretos, o formulário seguro pode estar temporariamente indisponível.",
              );
            }
          },
        },
      });
    })().catch(() => {
      if (live)
        setError(
          "O formulário seguro está indisponível. Volte e tente novamente mais tarde.",
        );
    });
    return () => {
      live = false;
      try {
        form?.unmount?.();
      } catch {
        /* No SDK error object leaves this boundary. */
      }
      formElement?.reset();
    };
  }, [amount]);
  const errorText = (key: string) => (
    <span className="mp-field-error" id={`${id.current}-${key}-error`}>
      {errors[key]}
    </span>
  );
  const common = (key: string) => ({
    id: `${id.current}-${key}`,
    "aria-invalid": Boolean(errors[key]),
    "aria-describedby": `${id.current}-${key}-error`,
  });
  return (
    <form
      ref={root}
      id={id.current}
      className="mp-form"
      noValidate
      onSubmitCapture={(e) => {
        if (busy || tokenizing || sending.current || !localValidation()) {
          e.preventDefault();
          e.stopPropagation();
        } else {
          submittedEmail.current = confirmedEmail.current;
        }
      }}
      onSubmit={(e) => e.preventDefault()}
    >
      <fieldset disabled={busy}>
        <legend>Dados de pagamento</legend>
        <div className="mp-field">
          <label id={`${id.current}-cardNumber-label`}>Número do cartão</label>
          <div
            {...common("cardNumber")}
            role="group"
            tabIndex={-1}
            aria-labelledby={`${id.current}-cardNumber-label`}
            className="mp-secure-field"
          />
          {errorText("cardNumber")}
        </div>
        <div className="mp-field-pair">
          {[
            ["expirationDate", "Validade"],
            ["securityCode", "Código de segurança"],
          ].map(([key, label]) => (
            <div className="mp-field" key={key}>
              <label id={`${id.current}-${key}-label`}>{label}</label>
              <div
                {...common(key)}
                role="group"
                tabIndex={-1}
                aria-labelledby={`${id.current}-${key}-label`}
                className="mp-secure-field"
              />
              {errorText(key)}
            </div>
          ))}
        </div>
        <div className="mp-field">
          <label htmlFor={`${id.current}-cardholderName`}>Nome no cartão</label>
          <input
            {...common("cardholderName")}
            autoComplete="cc-name"
            maxLength={120}
            required
            onBlur={(e) => {
              e.target.value = e.target.value.trim().replace(/\s+/g, " ");
              fieldError("cardholderName", holderError(e.target.value));
            }}
          />
          {errorText("cardholderName")}
        </div>
        <div className="mp-field">
          <label htmlFor={`${id.current}-issuer`}>Emissor do cartão</label>
          <select id={`${id.current}-issuer`} />
          <span className="mp-hint">Identificado a partir do cartão.</span>
        </div>
        <div hidden>
          <select id={`${id.current}-installments`} aria-label="Parcelas" />
        </div>
        <div className="mp-document-row">
          <div className="mp-field">
            <label htmlFor={`${id.current}-identificationType`}>
              Tipo de documento
            </label>
            <select id={`${id.current}-identificationType`} />
          </div>
          <div className="mp-field">
            <label htmlFor={`${id.current}-identificationNumber`}>
              Documento do titular
            </label>
            <input
              {...common("identificationNumber")}
              autoComplete="off"
              inputMode="numeric"
              maxLength={20}
              required
              onBlur={(e) =>
                fieldError(
                  "identificationNumber",
                  documentError(
                    root.current?.querySelector<HTMLSelectElement>(
                      `#${id.current}-identificationType`,
                    )?.value || "",
                    e.target.value,
                  ),
                )
              }
            />
            {errorText("identificationNumber")}
          </div>
        </div>
        <div className="mp-field">
          <label htmlFor={`${id.current}-cardholderEmail`}>
            E-mail do pagador
          </label>
          <input
            {...common("cardholderEmail")}
            type="email"
            autoComplete="email"
            maxLength={254}
            readOnly={busy || tokenizing}
            required
            onChange={(e) => {
              emailTouched.current = true;
              setPayerEmail(e.target.value);
              confirmedEmail.current = null;
              const consent = root.current?.querySelector<HTMLInputElement>('[name="consent"]');
              if (consent) consent.checked = false;
            }}
            onBlur={(e) => {
              const email = normalizePayerEmail(e.target.value);
              if (email) e.target.value = email;
              setPayerEmail(e.target.value);
              fieldError("cardholderEmail", email ? "" : "Informe um e-mail válido.");
            }}
          />
          {errorText("cardholderEmail")}
          <span className="mp-hint">
            {checkout
              ? "Informe o e-mail do pagador no Mercado Pago. Ele pode ser diferente do seu acesso à SYZIA e não altera sua conta administrativa."
              : "Usado no formulário seguro. Esta atualização do cartão não altera o pagador da assinatura existente."}
          </span>
          {checkout && payerEmail && (
            <span className="mp-hint" style={{ overflowWrap: "anywhere" }}>
              E-mail para esta assinatura: <strong>{normalizePayerEmail(payerEmail) || payerEmail}</strong>
            </span>
          )}
        </div>
        <label className="mp-consent">
          <input
            {...common("consent")}
            name="consent"
            type="checkbox"
            disabled={tokenizing}
            required
            onChange={(e) => {
              confirmedEmail.current = e.target.checked
                ? normalizePayerEmail(root.current?.querySelector<HTMLInputElement>(`#${id.current}-cardholderEmail`)?.value)
                : null;
              fieldError(
                "consent",
                confirmedEmail.current ? "" : "Confirme o e-mail e autorize as condições para continuar.",
              );
            }}
          />
          <span>
            Confirmo o e-mail do pagador informado e autorizo a assinatura e as cobranças mensais nas condições
            apresentadas.
          </span>
        </label>
        {errorText("consent")}
      </fieldset>
      {error && (
        <p role="alert" className="mp-inline-error">
          {error}
        </p>
      )}
      <button
        className="mp-primary"
        disabled={!ready || busy || tokenizing}
        type="submit"
      >
        {busy
          ? "Enviando solicitação…"
          : tokenizing
            ? "Protegendo os dados…"
            : "Confirmar meio de pagamento"}
      </button>
      <p className="mp-secure-note">
        Os dados do cartão são enviados diretamente ao Mercado Pago. A SYZIA não
        armazena número completo nem código de segurança.
      </p>
      {!ready && !error && <p role="status">Abrindo formulário seguro…</p>}
    </form>
  );
}
