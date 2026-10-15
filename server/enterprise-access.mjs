import { deliveryError } from "./access-mail.mjs";
import { createHash, randomBytes } from "node:crypto";
export const digest = (value) =>
  createHash("sha256").update(value).digest("hex");
export const accessErrors = new Set([
  "access_denied",
  "slug_conflict",
  "slug_invalid",
  "company_code_unavailable",
  "organization_deleted",
  "provisioning_incomplete",
  "provisioning_unavailable",
  "temporary_code_unavailable",
  "delivery_cooldown",
  "delivery_rate_limited",
  "organization_confirmation_required",
  "organization_history_requires_preservation",
  "access_invalid",
  "access_signup_in_progress",
  "access_rate_limited",
  "access_change_unavailable",
  "administrator_email_required",
  "username_conflict",
  "idempotency_conflict",
  "activation_invalid",
  "activation_uncertain",
  "access_unavailable",
  "access_already_provisioned",
  "shared_identity_requires_superadmin",
  "identity_context_required",
  "identity_exists_select_person",
  "existing_identity_requires_login",
  "email_confirmation_required",
  "billing_provider_not_configured",
  "selfservice_quote_expired",
  "session_expired",
]);
const activationReasons = new Set([
  "activation_context_invalid",
  "activation_already_used",
  "activation_preparation_incompatible",
  "activation_code_expired",
  "activation_attempts_exhausted",
  "activation_code_invalid",
  "activation_link_invalid",
  "activation_link_replaced",
  "activation_link_required",
  "activation_proof_invalid",
]);
const activationFailure = (reason, stage = "activation_code") => {
  throw Object.assign(Error("activation_invalid"), {
    code: "activation_invalid",
    stage,
    activation_reason: reason,
  });
};
const fail = (code) => {
  throw Object.assign(new Error(code), { code });
};
export function safeAccessError(error) {
  const detail = String(error?.message || "");
  const code = accessErrors.has(error?.code)
    ? error.code
    : accessErrors.has(error?.message)
      ? error.message
      : error?.code === "23505"
        ? detail.includes("enterprise_codes_code")
          ? "company_code_unavailable"
          : detail.includes("organizations_slug")
            ? "slug_conflict"
            : "username_conflict"
        : ["23514", "23502", "22023"].includes(error?.code)
          ? "access_invalid"
          : "access_unavailable";
  return {
    code,
    ...(activationReasons.has(error?.activation_reason)
      ? {
          diagnostic: {
            category: "activation",
            reason: error.activation_reason,
          },
        }
      : error?.diagnostic
        ? { diagnostic: authDiagnostic(error.diagnostic) }
        : {}),
    ...([
      "auth_identity",
      "finalize",
      "completed",
      "activation_code",
      "activation_password",
    ].includes(error?.stage)
      ? { stage: error.stage }
      : {}),
    ...(/^[a-f0-9-]{36}$/.test(error?.organization_id || "")
      ? { organization_id: error.organization_id }
      : {}),
    ...(/^[a-f0-9-]{36}$/.test(error?.account_id || "")
      ? { account_id: error.account_id }
      : {}),
    status: [
      "access_rate_limited",
      "delivery_cooldown",
      "delivery_rate_limited",
    ].includes(code)
      ? 429
      : code === "access_unavailable" || code === "activation_uncertain"
        ? 503
        : 400,
  };
}
const clean = (s, max = 128) =>
  typeof s === "string" && s.length <= max ? s.trim() : "";
const secret = () =>
  randomBytes(16).toString("hex").toUpperCase().match(/.{4}/g).join("-");
const proof = () => randomBytes(32).toString("base64url");
// Auth hashes passwords with bcrypt (maximum 72 bytes). Keep 384 random bits
// plus all four character classes; this internal secret is never delivered.
const provisioningPassword = () =>
  randomBytes(48).toString("base64url") + "aA0!";
export function authDiagnostic(error) {
  const allowed = new Set([
    "user_not_found",
    "email_exists",
    "email_already_exists",
    "email_address_invalid",
    "email_address_not_authorized",
    "user_already_exists",
    "bad_jwt",
    "not_admin",
    "unexpected_failure",
    "request_timeout",
    "over_request_rate_limit",
    "over_email_send_rate_limit",
    "database_error",
    "identity_mismatch",
    "invalid_credentials",
    "email_not_confirmed",
    "validation_failed",
    "weak_password",
    "bad_json",
    "conflict",
    "identity_already_exists",
    "identity_not_found",
    "email_provider_disabled",
    "user_banned",
    "user_sso_managed",
    "session_expired",
    "session_not_found",
    "refresh_token_not_found",
  ]);
  const reason = allowed.has(error?.code)
    ? error.code
    : "auth_provider_unclassified";
  const status = Number(error?.status);
  return {
    category: [401, 403].includes(status)
      ? "auth_credentials"
      : status === 429
        ? "auth_rate_limit"
        : status >= 500
          ? "auth_provider"
          : "auth_identity",
    status:
      Number.isInteger(status) && status >= 100 && status < 600
        ? status
        : undefined,
    reason,
  };
}
const sessionClaim = (token) => {
  const id = JSON.parse(
    Buffer.from(token.split(".")[1], "base64url").toString(),
  ).session_id;
  if (!/^[a-f0-9-]{36}$/.test(id || "")) fail("access_denied");
  return id;
};
const temporaryHash = (s) =>
  digest(clean(s, 100).replaceAll("-", "").toUpperCase());
// Each adapter call is isolated; no shared mutable Auth session in a server client.
export function enterpriseAccess({
  service,
  asUser,
  auth,
  signIn,
  signUp,
  paymentAdapter,
  sendInstructions = async () => {
    throw Object.assign(Error("email_not_configured"), {
      code: "email_not_configured",
    });
  },
}) {
  const actor = async (token) => {
    if (!token) fail("access_denied");
    const { data, error } = await auth.getUser(token);
    if (
      error?.name === "AuthSessionMissingError" ||
      [
        "session_expired",
        "session_not_found",
        "refresh_token_not_found",
      ].includes(error?.code)
    )
      fail("session_expired");
    if (error || !data?.user || data.user.is_anonymous) fail("access_denied");
    return data.user;
  };
  const rate = async (key, limit = 10) => {
    if (
      !(await service("access_rate", {
        p_key: digest(key),
        p_limit: limit,
        p_seconds: 600,
      }))
    )
      fail("access_rate_limited");
  };
  const deliver = async (id, user, code, rotate = false) => {
    const activation_link = proof();
    const envelope = await service("access_delivery_prepare_link", {
      p_link_hash: digest(activation_link),
      p_id: id,
      p_actor: user.id,
      p_hash: temporaryHash(code),
      p_rotate: rotate,
    });
    let outcome = "accepted";
    try {
      await sendInstructions({
        ...envelope,
        temporary_code: code,
        activation_link,
      });
    } catch (error) {
      outcome = deliveryError(error);
    }
    let recorded = false;
    try {
      recorded = await service("access_delivery_finish", {
        p_id: id,
        p_attempt: envelope.attempt_id,
        p_result: outcome,
      });
    } catch {}
    // Never expose contact or provider payload; cleartext code is returned once to the authorized manager.
    const { email, attempt_id, ...instructions } = envelope;
    return {
      ...instructions,
      activation_link,
      temporary_code: code,
      delivery: recorded ? outcome : "delivery_status_unknown",
    };
  };
  return async (path, body, { token, ip = "local" } = {}) => {
    if (!body || Array.isArray(body) || typeof body !== "object")
      fail("access_invalid");
    await rate("ip:" + ip, 120);
    if (path === "/access/contact") {
      await rate("lead:" + ip, 5);
      return service("acquisition_lead_submit", {
        p_key: body.request_key,
        p_name: clean(body.name, 120),
        p_company: clean(body.company, 160),
        p_phone: clean(body.phone, 40),
        p_email: clean(body.email, 254),
        p_interest: clean(body.interest, 1000),
      });
    }
    if (path === "/access/signup") {
      await rate("signup:" + ip, 5);
      const email = clean(body.email, 254).toLowerCase();
      if (
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        body.password.length > 128 ||
        body.password !== body.confirmation ||
        !/^[a-z][a-z0-9]{1,29}[.][a-z0-9][a-z0-9.]{0,29}$/.test(
          clean(body.username),
        ) ||
        clean(body.name, 120).length < 3
      )
        fail("access_invalid");
      if (await service("access_identity_exists", { p_email: email }))
        return { confirmation_required: true }; // Neutral response; never create a duplicate identity.
      if (!signUp) fail("access_unavailable");
      const authorization = randomBytes(32).toString("hex");
      await service("access_signup_authorize", { p_email: email, p_username: clean(body.username), p_hash: digest(authorization) });
      let result;
      try { result = await signUp({
        email,
        password: body.password,
        options: {
          captchaToken: clean(body.captcha, 4096),
          data: {
            display_name: clean(body.name, 120),
            syzia_username: clean(body.username),
            syzia_signup_authorization: authorization,
          },
        },
      }); } finally {
        // Only the digest crosses the service RPC. Never expose/log the nonce.
        await service("access_signup_release", { p_hash: digest(authorization) }).catch(() => {});
      }
      if (result.error)
        throw Object.assign(Error("access_unavailable"), {
          code: "access_unavailable",
          diagnostic: result.error,
        });
      return result.data?.session
        ? {
            session: {
              access_token: result.data.session.access_token,
              refresh_token: result.data.session.refresh_token,
            },
          }
        : { confirmation_required: true };
    }
    if (path === "/access/identity-login") {
      const identifier = clean(body.identifier, 254).toLowerCase();
      await rate("identity:" + identifier);
      const lookup = await service("access_identity_lookup", {
        p_identifier: identifier,
      });
      const { data, error } = await signIn({
        email:
          lookup?.email ||
          "unavailable-" + digest(identifier) + "@access.vireloq.invalid",
        password:
          typeof body.password === "string" && body.password.length <= 128
            ? body.password
            : "",
        options: { captchaToken: clean(body.captcha, 4096) },
      });
      if (error || !lookup || !data?.session) fail("identity_context_required");
      const verified = await actor(data.session.access_token);
      if (
        verified.id !== lookup.user_id ||
        (lookup.operation &&
          verified.app_metadata?.vireloq_password_operation !==
            lookup.operation)
      )
        fail("access_denied");
      const contexts = await service("access_identity_contexts", {
        p_user: verified.id,
      });
      if (!contexts.global && !contexts.personal && !contexts.companies.length)
        return {
          session: {
            access_token: data.session.access_token,
            refresh_token: data.session.refresh_token,
          },
          identity_setup_required: true,
        };
      const chosen = contexts.global
        ? contexts.personal || null
        : contexts.companies.length === 1
          ? contexts.companies[0]
          : contexts.personal || null;
      const ok = await service("access_register_session", {
        p_user: verified.id,
        p_session: sessionClaim(data.session.access_token),
        p_account: chosen?.id || null,
        p_generation: chosen?.generation || null,
      });
      if (!ok) fail("access_denied");
      return {
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
        contexts,
        organization_id: chosen?.organization_id || null,
      };
    }
    if (path === "/access/login" || path === "/access/global-login") {
      const global = path.endsWith("global-login"),
        code = clean(body.company_code).toUpperCase(),
        username = clean(body.username).toLowerCase();
      await rate(
        "login:" +
          (global ? clean(body.email).toLowerCase() : code + ":" + username),
      );
      let lookup = null;
      if (!global)
        lookup = await service("access_lookup", {
          p_code: code,
          p_username: username,
        });
      const email = global
        ? clean(body.email, 254)
        : lookup?.email ||
          "unavailable-" +
            digest(code + ":" + username) +
            "@access.vireloq.invalid";
      const { data, error } = await signIn({
        email,
        password:
          typeof body.password === "string" && body.password.length <= 1024
            ? body.password
            : "",
        options: { captchaToken: clean(body.captcha, 4096) },
      });
      if (!global && !lookup) {
        // Same dummy Auth call for unknown/pending identities. Only a valid secret reveals activation.
        const grant = proof();
        const verified = await service("access_verify_legacy", {
          p_code: code,
          p_username: username,
          p_hash: temporaryHash(body.password),
          p_proof: digest(grant),
        });
        if (verified?.valid)
          return { activation: { proof: grant, reset: verified.reset } };
      }
      if (error || !data?.session || (!global && !lookup))
        fail("access_denied");
      // Verify token using Auth before trusting session_id decoded from that verified token.
      const verified = await actor(data.session.access_token);
      if (
        verified.id !== data.user.id ||
        (!global &&
          (verified.id !== lookup.user_id ||
            (lookup.operation &&
              verified.app_metadata?.vireloq_password_operation !==
                lookup.operation)))
      )
        fail("access_denied");
      const claims = JSON.parse(
        Buffer.from(
          data.session.access_token.split(".")[1],
          "base64url",
        ).toString(),
      );
      const ok = await service("access_register_session", {
        p_user: verified.id,
        p_session: claims.session_id,
        p_account: lookup?.id || null,
        p_generation: lookup?.generation || null,
      });
      if (!ok) fail("access_denied");
      return {
        session: {
          access_token: data.session.access_token,
          refresh_token: data.session.refresh_token,
        },
      };
    }
    if (path === "/access/verify") {
      const selector = clean(body.activation_link);
      const legacy =
        !selector && clean(body.company_code) && clean(body.username);
      await rate(
        "code:" +
          (selector ||
            clean(body.company_code).toUpperCase() +
              ":" +
              clean(body.username).toLowerCase()),
      );
      if (!/^[A-Za-z0-9_-]{43}$/.test(selector) && !legacy)
        activationFailure("activation_link_invalid");
      const grant = proof();
      const common = {
        p_hash: temporaryHash(body.code),
        p_proof: digest(grant),
      };
      const result = selector
        ? await service("access_verify_link", {
            ...common,
            p_link_hash: digest(selector),
          })
        : await service("access_verify_legacy", {
            ...common,
            p_code: clean(body.company_code),
            p_username: clean(body.username),
          });
      if (!result?.valid)
        activationFailure(result?.reason || "activation_code_invalid");
      return { proof: grant, reset: result.reset };
    }
    if (path === "/access/activate") {
      await rate("activation:" + digest(clean(body.proof)));
      if (
        typeof body.password !== "string" ||
        body.password.length < 12 ||
        body.password.length > 128 ||
        body.password !== body.confirmation
      )
        fail("access_invalid");
      const task = await service("access_begin_activation", {
        p_proof: digest(clean(body.proof)),
      });
      if (!task)
        activationFailure("activation_proof_invalid", "activation_password");
      try {
        const { error } = await auth.admin.updateUserById(task.user_id, {
          password: body.password,
          app_metadata: { vireloq_password_operation: task.operation },
        });
        if (error) throw error;
      } catch (error) {
        await service("access_finish_activation", {
          p_id: task.id,
          p_operation: task.operation,
          p_success: false,
        }).catch(() => {});
        throw Object.assign(Error("activation_uncertain"), {
          code: "activation_uncertain",
          stage: "activation_password",
          diagnostic: error,
        });
      }
      if (
        !(await service("access_finish_activation", {
          p_id: task.id,
          p_operation: task.operation,
          p_success: true,
        }))
      )
        fail("activation_uncertain");
      // Recipient signs in with the newly chosen password through the same tenant resolver.
      return { activated: true };
    }
    const user = await actor(token);
    if (path === "/access/selfservice-register") {
      const account = await service("access_selfservice_identity", {
        p_user: user.id,
        p_name: clean(body.name || user.user_metadata?.display_name, 120),
        p_username: clean(body.username || user.user_metadata?.syzia_username),
      });
      if (
        !(await service("access_register_session", {
          p_user: user.id,
          p_session: sessionClaim(token),
          p_account: account.id,
          p_generation: account.generation,
        }))
      )
        fail("access_denied");
      return { registered: true };
    }
    if (path === "/access/contexts") {
      await asUser(token, "access_session", {
        p_activity: false,
        p_logout: false,
      });
      return service("access_identity_contexts", { p_user: user.id });
    }
    if (path === "/access/context")
      return service("access_select_context", {
        p_user: user.id,
        p_session: sessionClaim(token),
        p_account: body.account_id || null,
      });
    if (path === "/access/selfservice-payment") {
      await asUser(token, "access_session", {
        p_activity: false,
        p_logout: false,
      });
      const draft = await asUser(token, "selfservice_context", {});
      if (!draft || draft.id !== body.id || draft.revision !== body.revision)
        fail("access_denied");
      if (
        !paymentAdapter ||
        paymentAdapter.mode !== "test" ||
        paymentAdapter.name !== "mock"
      )
        fail("billing_provider_not_configured");
      const payment = await paymentAdapter.validateMethod({
        draftId: draft.id,
        revision: draft.revision,
        userId: user.id,
      });
      if (!payment?.valid || typeof payment.reference !== "string")
        fail("billing_provider_not_configured");
      return service("selfservice_payment_bind", {
        p_user: user.id,
        p_id: draft.id,
        p_revision: draft.revision,
        p_reference: payment.reference,
        p_provider: paymentAdapter.name,
        p_simulation: true,
      });
    }
    await rate("manager:" + user.id, 30);
    if (
      path === "/access/create-organization" ||
      (path === "/access/provision" && !body.organization_id)
    ) {
      const slug = clean(body.slug);
      if (
        !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(slug) ||
        slug.length < 2 ||
        slug.length > 70
      )
        fail("slug_invalid");
    }
    if (
      path === "/access/provision" &&
      (!body.organization_id || body.role === "admin_empresa")
    ) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean(body.email, 254)))
        fail("administrator_email_required");
    }
    if (path === "/access/create-organization") {
      return asUser(token, "access_create_organization", {
        p_name: clean(body.company_name),
        p_slug: clean(body.slug),
        p_key: body.request_key,
      });
    }
    if (
      ["/access/provision", "/access/resume", "/access/person"].includes(path)
    ) {
      // Reuse the database session guard, including idle/revocation checks,
      // before touching Auth. An expired session has its own actionable error.
      await asUser(token, "access_session", {
        p_activity: false,
        p_logout: false,
      });
      const reserved =
        path === "/access/person"
          ? await asUser(token, "people_reserve", {
              p_display: clean(body.name),
              p_username: clean(body.username).toLowerCase(),
              p_email: clean(body.email, 254),
              p_phone: clean(body.phone, 40),
              p_role: body.role,
              p_key: body.request_key,
            })
          : path === "/access/resume"
            ? await asUser(token, "access_resume", { p_id: body.id })
            : await asUser(token, "access_reserve", {
                p_org: body.organization_id || null,
                p_name: clean(body.company_name),
                p_slug: clean(body.slug),
                p_display: clean(body.name) + " " + clean(body.surname),
                p_username: clean(body.username).toLowerCase(),
                p_email: clean(body.email, 254),
                p_phone: clean(body.phone, 40),
                p_role: body.organization_id ? body.role : "admin_empresa",
                p_key: body.request_key,
                p_existing: body.existing_user || null,
              });
      const partial = (code, stage) =>
        Object.assign(Error(code), {
          code,
          stage,
          organization_id: reserved.organization_id,
          account_id: reserved.id,
        });
      if (reserved.state !== "reserved")
        throw partial("access_already_provisioned", "completed");
      try {
        const existing = await auth.admin.getUserById(reserved.user_id);
        // A provider outage must never be interpreted as "user does not exist".
        if (
          existing.error &&
          existing.error.status !== 404 &&
          existing.error.code !== "user_not_found"
        )
          throw existing.error;
        if (!existing.data?.user) {
          const created = await auth.admin.createUser({
            id: reserved.user_id,
            email: randomBytes(32).toString("hex") + "@access.vireloq.invalid",
            email_confirm: true,
            app_metadata: { vireloq_provisioned: true },
            password: provisioningPassword(),
          });
          if (created.error) {
            // A concurrent worker may have committed the same reserved identity.
            const retry = await auth.admin.getUserById(reserved.user_id);
            if (retry.error || !retry.data?.user) throw created.error;
            if (retry.data.user.id !== reserved.user_id)
              throw Object.assign(Error("identity_mismatch"), {
                code: "identity_mismatch",
              });
          } else if (
            created.data?.user?.id &&
            created.data.user.id !== reserved.user_id
          )
            throw Object.assign(Error("identity_mismatch"), {
              code: "identity_mismatch",
            });
        } else if (!existing.data.user.email_confirmed_at) {
          const { error } = await auth.admin.updateUserById(reserved.user_id, {
            email: randomBytes(32).toString("hex") + "@access.vireloq.invalid",
            email_confirm: true,
          });
          if (error) throw error;
        }
      } catch (error) {
        throw Object.assign(
          partial("provisioning_incomplete", "auth_identity"),
          { diagnostic: error },
        );
      }
      const code = secret(),
        activation_link = proof();
      let result;
      try {
        result = await service("access_finish_provision_link", {
          p_link_hash: digest(activation_link),
          p_id: reserved.id,
          p_actor: user.id,
          p_hash: temporaryHash(code),
        });
      } catch {
        throw partial("temporary_code_unavailable", "finalize");
      }
      const prepared = {
        ...result,
        organization_id: reserved.organization_id,
        activation_link,
        temporary_code: code,
      };
      // Manual delivery is the default. No SMTP request is made during provisioning.
      // Names are read through the same authorized views; a presentation failure never loses the issued secret.
      try {
        if (reserved.organization_id) {
          const team = await asUser(token, "access_team", {
            p_org: reserved.organization_id,
          });
          prepared.name = team.accounts.find((a) => a.id === reserved.id)?.name;
        } else {
          const people = await asUser(token, "people_directory", {});
          prepared.name = people.find(
            (p) => p.account_id === reserved.id,
          )?.name;
        }
      } catch {}
      return { ...prepared, delivery: "manual" };
    }
    if (path === "/access/resend") {
      const team = await asUser(token, "access_team", {
        p_org: body.organization_id,
      });
      const account = team.accounts.find((a) => a.id === body.id);
      if (
        !account ||
        account.role !== "admin_empresa" ||
        account.state !== "pending"
      )
        fail("access_denied");
      return deliver(body.id, user, secret(), true);
    }
    if (path === "/access/reset") {
      let account;
      if (body.organization_id) {
        const team = await asUser(token, "access_team", {
          p_org: body.organization_id,
        });
        account = team.accounts.find((a) => a.id === body.id);
        if (!account) fail("access_denied");
      } else {
        const people = await asUser(token, "people_directory", {});
        account = people.find((p) => p.account_id === body.id);
        if (!account) fail("access_denied");
      }
      const code = secret(),
        activation_link = proof();
      const result = await service("access_reset_link", {
        p_link_hash: digest(activation_link),
        p_id: body.id,
        p_actor: user.id,
        p_hash: temporaryHash(code),
      });
      return {
        ...result,
        name: account.name,
        organization_id: body.organization_id || null,
        temporary_code: code,
        activation_link,
        reissued: true,
        delivery: "manual",
      };
    }
    fail("access_invalid");
  };
}
