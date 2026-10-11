const ddds = new Set(
  "11 12 13 14 15 16 17 18 19 21 22 24 27 28 31 32 33 34 35 37 38 41 42 43 44 45 46 47 48 49 51 53 54 55 61 62 63 64 65 66 67 68 69 71 73 74 75 77 79 81 82 83 84 85 86 87 88 89 91 92 93 94 95 96 97 98 99".split(
    " ",
  ),
);
export function normalizePhone(value: string): string | null {
  const raw = value.trim();
  if (!raw) return "";
  if (raw.length > 40 || !/^\+?[0-9 ().-]+$/.test(raw)) return null;
  const n = raw.replace(/\D/g, "");
  if (raw.startsWith("+") && !n.startsWith("55"))
    return /^[1-9]\d{6,14}$/.test(n) && !/^(\d)\1+$/.test(n) ? "+" + n : null;
  const br = [12, 13].includes(n.length) && n.startsWith("55") ? n.slice(2) : n;
  if (
    !ddds.has(br.slice(0, 2)) ||
    !(/^\d{2}9\d{8}$/.test(br) || /^\d{2}[2-5]\d{7}$/.test(br)) ||
    /^(\d)\1+$/.test(br.slice(2))
  )
    return null;
  return "55" + br;
}
export function formatPhone(value: string) {
  const normalized = normalizePhone(value);
  if (!normalized || !normalized.startsWith("55")) return value;
  const br = normalized.slice(2);
  return `(${br.slice(0, 2)}) ${br.slice(2, -4)}-${br.slice(-4)}`;
}
export function whatsappHref(value: string, text = "") {
  const normalized = normalizePhone(value);
  if (!normalized) return null;
  return `https://wa.me/${normalized.replace(/^\+/, "")}${text ? "?text=" + encodeURIComponent(text) : ""}`;
}
