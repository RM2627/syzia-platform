// Temporary, server-only support metadata. Never retain raw bodies or arbitrary values.
// WeakMap keeps it out of serialized errors, RPC arguments and browser responses.
const metadata = new WeakMap();
const fields = Object.freeze(['preapproval_plan_id', 'external_reference', 'payer_email',
  'card_token_id', 'status', 'reason', 'back_url', 'notification_url']);
const scoped = error => error?.providerStage === 'create' && [400, 422].includes(error?.providerStatus);
const requestIdPattern = /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i;

function requestId(response, body) {
  try {
    const value = response.headers?.get('x-request-id');
    if (value == null) return { provider_request_id_status: 'missing' };
    // No trimming, URLs, free-form identifiers, multiple header values or control characters.
    const card = Object.getOwnPropertyDescriptor(body || {}, 'card_token_id')?.value;
    if (typeof value !== 'string' || ![32, 36].includes(value.length) || !requestIdPattern.test(value) ||
        (typeof card === 'string' && value.toLowerCase() === card.toLowerCase()))
      return { provider_request_id_status: 'invalid' };
    return { provider_request_id_status: 'valid', provider_request_id: value };
  } catch { return { provider_request_id_status: 'unavailable' }; }
}

export function capturePreapprovalSupport(error, response, body) {
  if (!scoped(error)) return;
  try {
    const object = body !== null && typeof body === 'object' && !Array.isArray(body);
    const shape = Object.fromEntries(fields.map(name => {
      const descriptor = object ? Object.getOwnPropertyDescriptor(body, name) : undefined;
      const value = descriptor?.value;
      const present = Boolean(descriptor?.enumerable && Object.hasOwn(descriptor, 'value') &&
        value !== undefined && !['function', 'symbol'].includes(typeof value));
      return [name, Object.freeze({ present, non_empty_string: present && typeof value === 'string' && value.length > 0 })];
    }));
    metadata.set(error, Object.freeze({ support_case: 'WCS-56983', ...requestId(response, body),
      provider_request_fields: Object.freeze(shape),
      // Unknown property NAMES can also contain personal data. Never echo them.
      provider_request_has_unexpected_fields: !object || Object.keys(body).some(name => !fields.includes(name)),
    }));
  } catch { /* Instrumentation must never replace a financial error or make a retry safe. */ }
}

export function copyPreapprovalSupport(source, target) {
  if (scoped(source) && scoped(target) && metadata.has(source)) metadata.set(target, metadata.get(source));
}

export function safePreapprovalSupport(error) {
  // Plain error properties are not trusted: only metadata created above may reach logs.
  return scoped(error) ? metadata.get(error) || {} : {};
}
