/** Server-only orchestration. Never return provider messages, credentials or Auth links. */
export const deliveryStatuses = Object.freeze({
  invitation_invalid: 400, access_denied: 403, invitation_not_available: 403,
  invitation_expired: 410, invitation_revoked: 410, invitation_cooldown: 429,
  invitation_attempt_limit: 429, invitation_rate_limited: 429,
  email_recipient_not_authorized: 422, email_delivery_failed: 502,
  recovery_delivery_failed: 502, temporary_delivery_failure: 503,
  invitation_delivery_unavailable: 503, invitation_delivery_unconfirmed: 503,
});
export class InvitationDeliveryError extends Error {
  constructor(code, stage = 'request') {
    super(Object.hasOwn(deliveryStatuses, code) ? code : 'temporary_delivery_failure');
    this.code = this.message;
    this.status = deliveryStatuses[this.code];
    this.stage = stage;
  }
}
export function safeDeliveryError(error) {
  return error instanceof InvitationDeliveryError ? error : new InvitationDeliveryError('temporary_delivery_failure');
}
function providerError(error, stage) {
  const code = error?.code;
  if (error?.status === 429 || ['over_email_send_rate_limit', 'over_request_rate_limit'].includes(code))
    return new InvitationDeliveryError('invitation_rate_limited', stage);
  if (code === 'email_address_not_authorized' || error?.message === 'Email address not authorized')
    return new InvitationDeliveryError('email_recipient_not_authorized', stage);
  if (['email_provider_disabled', 'email_not_enabled', 'captcha_failed'].includes(code))
    return new InvitationDeliveryError('invitation_delivery_unavailable', stage);
  if (['request_timeout', 'hook_timeout', 'hook_timeout_after_retry'].includes(code) || error?.name === 'AuthRetryableFetchError' || error instanceof TypeError)
    return new InvitationDeliveryError('temporary_delivery_failure', stage);
  // Delivery endpoints can fail due to SMTP, hooks or Auth. Do not assert an SMTP root cause from HTTP 500 alone.
  return new InvitationDeliveryError(stage === 'recovery' ? 'recovery_delivery_failed' : 'email_delivery_failed', stage);
}
function existingAccount(error) {
  return ['email_exists', 'user_already_exists'].includes(error?.code) ||
    (!error?.code && error?.status === 422 && error?.message === 'A user with this email address has already been registered');
}
async function classifyClaim(error, inspectInvitation, token, invitationId) {
  const message = error?.message;
  if (!['invitation_unavailable', 'invitation_rate_limit', 'access_denied'].includes(message))
    return new InvitationDeliveryError('temporary_delivery_failure', 'claim');
  // Optional diagnostic SELECT MUST run as the authenticated actor under RLS, never service-role SELECT.
  // The locking RPC remains the authority. A diagnostic failure cannot permit delivery.
  let row;
  try { row = await inspectInvitation?.(token, invitationId); } catch { /* no extra information */ }
  if (message === 'invitation_rate_limit') {
    if (row?.delivery_attempts >= 5) return new InvitationDeliveryError('invitation_attempt_limit', 'claim');
    return new InvitationDeliveryError('invitation_cooldown', 'claim');
  }
  if (row?.state === 'revoked') return new InvitationDeliveryError('invitation_revoked', 'claim');
  if (row?.state === 'pending' && Date.parse(row.expires_at) <= Date.now())
    return new InvitationDeliveryError('invitation_expired', 'claim');
  return new InvitationDeliveryError('invitation_not_available', 'claim');
}
export async function deliverInvitation({ token, invitationId, auth, rpcAsService, appOrigin, inspectInvitation }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(invitationId || ''))
    throw new InvitationDeliveryError('invitation_invalid');
  if (!token) throw new InvitationDeliveryError('access_denied', 'authentication');
  let userResult;
  try { userResult = await auth.getUser(token); }
  catch { throw new InvitationDeliveryError('temporary_delivery_failure', 'authentication'); }
  if (userResult.error?.status >= 500 || userResult.error?.name === 'AuthRetryableFetchError')
    throw new InvitationDeliveryError('temporary_delivery_failure', 'authentication');
  if (userResult.error || !userResult.data?.user || userResult.data.user.is_anonymous)
    throw new InvitationDeliveryError('access_denied', 'authentication');
  let origin;
  try {
    origin = new URL(appOrigin);
    if (origin.username || origin.password || origin.pathname !== '/' || origin.search || origin.hash ||
        !(origin.protocol === 'https:' || (origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname)))) throw Error();
  } catch { throw new InvitationDeliveryError('invitation_delivery_unavailable', 'configuration'); }
  let invitation;
  try {
    invitation = await rpcAsService('foundation_claim_invitation_delivery', { p_invite: invitationId, p_actor: userResult.data.user.id });
  } catch (error) { throw await classifyClaim(error, inspectInvitation, token, invitationId); }
  let sent = false, failure = null, stage = 'invite';
  try {
    const redirectTo = origin.origin + '/aceitar-convite?convite=' + encodeURIComponent(invitation.id);
    const result = await auth.admin.inviteUserByEmail(invitation.email, { redirectTo });
    if (result.error) {
      if (!existingAccount(result.error)) throw result.error;
      // A new recovery proof for the SAME address; never admin-confirm email, create a membership or grant trial here.
      stage = 'recovery';
      const recovery = await auth.resetPasswordForEmail(invitation.email, { redirectTo });
      if (recovery.error) throw recovery.error;
    }
    sent = true;
  } catch (error) { failure = providerError(error, stage); }
  try {
    await rpcAsService('foundation_finish_invitation_delivery', { p_invite: invitation.id, p_lease: invitation.lease, p_sent: sent });
  } catch {
    // Keep the delivery error if both delivery and bookkeeping fail; never turn this into success.
    if (!failure) failure = new InvitationDeliveryError('invitation_delivery_unconfirmed', 'finalize');
  }
  if (failure) throw failure;
  return { sent: true };
}
