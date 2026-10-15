// Values stay inside the form/SDK. Only static error messages leave these helpers.
import { normalizeCPF } from "../../shared/cpf.mjs";
export function holderError(value: string) {
  return /^[\p{L}\p{M}][\p{L}\p{M} .'-]{1,119}$/u.test(value.trim())
    ? ""
    : "Informe o nome como aparece no cartão.";
}
export function documentError(type: string, value: string) {
  if (type === "CPF") return normalizeCPF(value) ? "" : "Confira os dígitos do documento.";
  const n = value.replace(/[.\-/\s]/g, "");
  if (type !== "CPF" && type !== "CNPJ")
    return n.length >= 3 && n.length <= 20
      ? ""
      : "Confira o documento do titular.";
  const size = type === "CPF" ? 11 : 14;
  if (!/^\d+$/.test(n) || n.length !== size || /^(\d)\1+$/.test(n))
    return "Confira os dígitos do documento.";
  const check = (count: number) => {
    const weights =
      type === "CPF"
        ? Array.from({ length: count }, (_, i) => count + 1 - i)
        : Array.from({ length: count }, (_, i) => ((count - 1 - i) % 8) + 2);
    const remainder =
      weights.reduce((sum, w, i) => sum + Number(n[i]) * w, 0) % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };
  return check(size - 2) === Number(n[size - 2]) &&
    check(size - 1) === Number(n[size - 1])
    ? ""
    : "Confira os dígitos do documento.";
}
export const secureFieldErrors: Record<string, string> = {
  cardNumber: "Confira o número do cartão no campo seguro.",
  expirationDate: "Informe uma validade válida no formato mês/ano.",
  securityCode: "Confira o código de segurança do cartão.",
};
