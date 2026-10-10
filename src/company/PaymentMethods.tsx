const methods = [
  ["Pix", /pix/i],
  ["Dinheiro", /dinheiro|cash/i],
  ["Cartão presencial", /cart[aã]o|d[eé]bito|cr[eé]dito|maquininha/i],
  ["Transferência", /transfer[eê]ncia/i],
] as const;
export function PaymentMethods({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const parts = value
      .split(/[,;\n]+/)
      .map((v) => v.trim())
      .filter(Boolean),
    selected = methods
      .filter(([, pattern]) => parts.some((p) => pattern.test(p)))
      .map(([label]) => label);
  const other = parts
    .filter((p) => !methods.some(([, pattern]) => pattern.test(p)))
    .join("; ");
  const set = (next: string[], extra = other) =>
    onChange([...next, ...(extra ? [extra] : [])].join(", "));
  return (
    <section id="pagamentos" className="payment-methods">
      <h3>Formas de pagamento aceitas</h3>
      <p>Informe como seus clientes podem pagar diretamente à empresa.</p>
      <input type="hidden" name="payment_methods" value={value} />
      <div className="payment-method-options">
        {methods.map(([label]) => (
          <label className="check-field" key={label}>
            <input
              type="checkbox"
              checked={selected.includes(label)}
              onChange={(e) =>
                set(
                  e.target.checked
                    ? [...selected, label]
                    : selected.filter((s) => s !== label),
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      <label className="field">
        Outro ou informações adicionais
        <input
          aria-label="Outro meio de pagamento"
          maxLength={1500}
          value={other}
          placeholder="Opcional"
          onChange={(e) => set(selected, e.target.value)}
        />
      </label>
      <small>
        As informações aparecem após publicar as alterações da página.
      </small>
    </section>
  );
}
