// Closed diagnostics: never reflect Auth messages, addresses, metadata or secrets.
export function signupFailure(error) {
  const code = error?.code;
  if (
    [
      "over_request_rate_limit",
      "over_email_send_rate_limit",
      "over_sms_send_rate_limit",
    ].includes(code) ||
    error?.status === 429
  )
    return "access_rate_limited";
  if (
    [
      "captcha_failed",
      "weak_password",
      "validation_failed",
      "email_address_invalid",
    ].includes(code)
  )
    return "access_invalid";
  if (
    [
      "email_provider_disabled",
      "signup_disabled",
      "email_address_not_authorized",
      "hook_timeout",
      "hook_timeout_after_retry",
    ].includes(code)
  )
    return "signup_configuration_unavailable";
  return "signup_confirmation_uncertain";
}
export const neutralSignupError = (error) =>
  [
    "user_not_found",
    "email_exists",
    "email_already_exists",
    "user_already_exists",
    "email_not_confirmed",
  ].includes(error?.code);

// Server-side implicit signup already used by SYZIA: no PKCE verifier tied to another device.
// Resend uses the same official Auth mechanism and fixed, trusted redirect.
export function registrationTransport(createClient, env, origin) {
  const options = {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      flowType: "implicit",
    },
  };
  const client = () =>
    createClient(
      env.SUPABASE_URL,
      env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_SERVICE_ROLE_KEY,
      options,
    );
  const redirect = origin + "/confirmar-email";
  return {
    signUp: (credentials) =>
      client().auth.signUp({
        ...credentials,
        options: { ...credentials.options, emailRedirectTo: redirect },
      }),
    resendSignup: (credentials) =>
      client().auth.resend({
        ...credentials,
        type: "signup",
        options: { ...credentials.options, emailRedirectTo: redirect },
      }),
  };
}
