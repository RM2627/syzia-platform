// A transient checkout value, never an authorization or trial identity.
// Preserve the local part (including case and + tags); normalize only the domain
// and surrounding spaces. No provider-specific mailbox equivalence rules.
export function normalizePayerEmail(value) {
  if (typeof value !== "string" || /[\x00-\x1f\x7f]/.test(value)) return null;
  const email = value.trim();
  if (email.length > 254) return null;
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  const [local, domain] = parts;
  if (!local || local.length > 64 || !/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+$/.test(local)
      || local.startsWith(".") || local.endsWith(".") || local.includes("..")) return null;
  const labels = domain.split(".");
  if (labels.length < 2 || labels.some(label => !/^[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?$/.test(label))) return null;
  return local + "@" + domain.toLowerCase();
}
