// Consistency only, never proof of identity or ownership. Do not log input.
export function normalizeCPF(value) {
  if (typeof value !== 'string') return null;
  const text = value.replace(/^ +| +$/g, '');
  if (!/^(?:[0-9]{11}|[0-9]{3}\.[0-9]{3}\.[0-9]{3}-[0-9]{2})$/.test(text)) return null;
  const digits = text.replace(/[.-]/g, '');
  if (/^([0-9])\1+$/.test(digits)) return null;
  for (const count of [9, 10]) {
    let sum = 0;
    for (let i = 0; i < count; i++) sum += Number(digits[i]) * (count + 1 - i);
    const remainder = sum % 11, check = remainder < 2 ? 0 : 11 - remainder;
    if (Number(digits[count]) !== check) return null;
  }
  return digits;
}
