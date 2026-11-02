import test from "node:test";
import assert from "node:assert/strict";
import {
  enterpriseAccess,
  safeAccessError,
} from "../../server/enterprise-access.mjs";
import { registrationTransport } from "../../server/signup-recovery.mjs";
import {
  registrationCallback,
  registrationConfirmation,
  registrationMessage,
  pendingRegistration,
} from "../../src/access/registration-core.ts";
const uid = "11111111-1111-4111-8111-111111111111",
  sid = "22222222-2222-4222-8222-222222222222";
const token =
  "e30." +
  Buffer.from(JSON.stringify({ sub: uid, session_id: sid })).toString(
    "base64url",
  ) +
  ".fixture";
const invitation = "A".repeat(43),
  email = "person@example.invalid";
const form = {
  name: "Lia Costa",
  username: "lia.costa",
  email,
  password: "FictionalPassword070!",
  confirmation: "FictionalPassword070!",
  invitation,
};
function fixture(opts = {}) {
  const calls = [];
  let created = 0;
  const service = async (n, a) => {
    calls.push([n, a]);
    if (n === "access_rate") return opts.rate !== false;
    if (n === "access_identity_exists") return opts.exists || false;
    if (n === "access_activation_remember") {
      if (opts.badInvite) throw Error("registration_invitation_invalid");
      return;
    }
    if (n === "access_signup_authorize" || n === "access_signup_release")
      return;
    if (n === "access_registration_profile")
      return {
        name: form.name,
        username: form.username,
        missing_name: false,
        missing_username: false,
      };
    if (n === "access_identity_contexts")
      return {
        global: false,
        personal: opts.account ? { id: uid, generation: 1 } : null,
        companies: [],
      };
    if (n === "access_register_session") return opts.register !== false;
    throw Error("unexpected " + n);
  };
  const api = enterpriseAccess({
    service,
    asUser: async () => {
      if (opts.register === false) throw Error("session_expired");
      return {};
    },
    auth: {
      getUser: async () => ({
        data: {
          user: {
            id: uid,
            email,
            is_anonymous: false,
            email_confirmed_at: opts.unconfirmed ? null : "2026-11-02",
          },
        },
      }),
    },
    signUp: async (x) => {
      created++;
      calls.push(["signUp", x]);
      if (opts.lost) throw Error("PRIVATE_PROVIDER_MESSAGE");
      return { data: { session: null }, error: opts.error };
    },
    resendSignup: async (x) => {
      calls.push(["resend", x]);
      return { error: opts.error };
    },
  });
  return { api, calls, count: () => created };
}
test("signup persists metadata and durable return before Auth; no tokens in RPC arguments", async () => {
  const f = fixture();
  assert.deepEqual(await f.api("/access/signup", form), {
    confirmation_required: true,
  });
  const s = f.calls.find((x) => x[0] === "signUp")[1];
  assert.equal(s.options.data.display_name, form.name);
  assert.equal(s.options.data.syzia_username, form.username);
  assert.ok(
    f.calls.findIndex((x) => x[0] === "access_activation_remember") <
      f.calls.findIndex((x) => x[0] === "signUp"),
  );
  assert.equal(
    f.calls.find((x) => x[0] === "access_activation_remember")[1].p_hash.length,
    64,
  );
  assert.ok(
    !JSON.stringify(f.calls.filter((x) => x[0] !== "signUp")).includes(
      invitation,
    ),
  );
});
test("existing pending identity never invokes signUp or overwrites original metadata", async () => {
  const f = fixture({ exists: true });
  assert.deepEqual(await f.api("/access/signup", form), {
    confirmation_required: true,
  });
  assert.equal(f.count(), 0);
  await f.api("/access/signup-confirmation", { email, invitation });
  assert.equal(f.count(), 0);
  assert.equal(f.calls.filter((x) => x[0] === "resend").length, 1);
});
test("interrupted signup is uncertain, authorization released, no false sent response", async () => {
  const f = fixture({ lost: true });
  await assert.rejects(
    f.api("/access/signup", form),
    (e) => safeAccessError(e).code === "signup_confirmation_uncertain",
  );
  assert.ok(f.calls.some((x) => x[0] === "access_signup_release"));
});
for (const [code, expected] of [
  ["unexpected_failure", "signup_confirmation_uncertain"],
  ["over_email_send_rate_limit", "access_rate_limited"],
  ["email_provider_disabled", "signup_configuration_unavailable"],
  ["captcha_failed", "access_invalid"],
])
  test("safe signup/resend failure " + code, async () => {
    const f = fixture({
      error: {
        code,
        status: code === "over_email_send_rate_limit" ? 429 : 500,
        message: email + " PRIVATE_PROVIDER_MESSAGE",
      },
    });
    for (const path of ["/access/signup", "/access/signup-confirmation"])
      await assert.rejects(f.api(path, form), (e) => {
        const s = safeAccessError(e);
        assert.equal(s.code, expected);
        assert.ok(!JSON.stringify(s).includes(email));
        assert.ok(!JSON.stringify(s).includes("PRIVATE_PROVIDER_MESSAGE"));
        return true;
      });
  });
test("resend is neutral for missing/existing/confirmed, only official type signup, no new user", async () => {
  for (const code of [
    null,
    "user_not_found",
    "email_not_confirmed",
    "email_exists",
  ]) {
    const f = fixture({ error: code ? { code } : null });
    assert.deepEqual(
      await f.api("/access/signup-confirmation", { email, invitation }),
      { confirmation_required: true },
    );
    assert.equal(f.count(), 0);
    assert.equal(f.calls.find((x) => x[0] === "resend")[1].type, "signup");
  }
});
test("server limits and invalid invitation prevent sending", async () => {
  for (const opts of [{ rate: false }, { badInvite: true }]) {
    const f = fixture(opts);
    await assert.rejects(
      f.api("/access/signup-confirmation", { email, invitation }),
    );
    assert.ok(!f.calls.some((x) => x[0] === "resend"));
  }
});
test("username invalid syntax rejected before creating Auth identity", async () => {
  for (const username of ["lia.costa.", "lia..costa"]) {
    const f = fixture();
    await assert.rejects(
      f.api("/access/signup", { ...form, username }),
      /access_invalid/,
    );
    assert.equal(f.count(), 0);
  }
});
test("identity status requires verified Auth and email; existing session restrictions preserved", async () => {
  const f = fixture();
  await assert.rejects(f.api("/access/signup-status", {}), /access_denied/);
  await assert.rejects(
    fixture({ unconfirmed: true }).api("/access/signup-status", {}, { token }),
    /email_confirmation_required/,
  );
  const status = await f.api(
    "/access/signup-status",
    { user_id: "someone-else" },
    { token },
  );
  assert.equal(status.name, form.name);
  assert.equal(
    f.calls.find((x) => x[0] === "access_registration_profile")[1].p_user,
    uid,
  );
  await assert.rejects(
    fixture({ account: true, register: false }).api(
      "/access/signup-status",
      {},
      { token },
    ),
    /session_expired/,
  );
});
test("runtime forces same-origin callback and implicit Auth, with independent clients; no SMTP or user-controlled redirect", async () => {
  const calls = [];
  const create = (url, key, options) => {
    calls.push({ url, key, options });
    return {
      auth: {
        signUp: async (x) => calls.push(x),
        resend: async (x) => calls.push(x),
      },
    };
  };
  const t = registrationTransport(
    create,
    {
      SUPABASE_URL: "https://local.invalid",
      SUPABASE_PUBLISHABLE_KEY: "fixture-key",
    },
    "https://app.example.invalid",
  );
  await t.signUp({
    email,
    options: {
      emailRedirectTo: "https://evil.invalid",
      data: { display_name: form.name },
    },
  });
  await t.resendSignup({
    email,
    options: { emailRedirectTo: "https://evil.invalid" },
  });
  assert.equal(calls[0].options.auth.flowType, "implicit");
  assert.equal(calls[2].options.auth.flowType, "implicit");
  for (const i of [1, 3])
    assert.equal(
      calls[i].options.emailRedirectTo,
      "https://app.example.invalid/confirmar-email",
    );
  assert.equal(calls[1].options.data.display_name, form.name);
  assert.equal(calls[3].type, "signup");
});
test("cross-device implicit callback verifies official user and consumes once under double click", async () => {
  let consumed = 0,
    verified = 0;
  const user = { id: uid, email_confirmed_at: "today" };
  const c = registrationCallback(
    "https://app.invalid/confirmar-email#type=signup&access_token=fixture-token&refresh_token=fixture-refresh",
  );
  const confirm = registrationConfirmation(
    {
      setSession: async () => {
        consumed++;
        return { data: { session: { user } } };
      },
      getUser: async () => {
        verified++;
        return { data: { user } };
      },
    },
    c,
  );
  assert.deepEqual(await confirm(), await confirm());
  await Promise.all([confirm(), confirm()]);
  assert.equal(consumed, 1);
  assert.equal(verified, 1);
});
test("expired/reused links, missing session and legacy PKCE mismatch offer login/resend, never signup", async () => {
  const invalid = registrationCallback(
    "https://app.invalid/confirmar-email#error=access_denied&error_description=private",
  );
  assert.equal(invalid.kind, "invalid");
  await assert.rejects(
    registrationConfirmation({}, invalid)(),
    /confirmation_link_invalid/,
  );
  await assert.rejects(
    registrationConfirmation(
      { getSession: async () => ({ data: { session: null } }) },
      { kind: "none" },
    )(),
    /confirmation_login_required/,
  );
  await assert.rejects(
    registrationConfirmation(
      {
        exchangeCodeForSession: async () => ({
          error: { code: "bad_code_verifier" },
        }),
      },
      { kind: "pkce", code: "fictional" },
    )(),
    /confirmation_link_invalid/,
  );
  assert.ok(!registrationMessage({ message: "PRIVATE" }).includes("PRIVATE"));
});
test("signup callback cannot consume password recovery/invitation tokens; existing session is checked officially", async () => {
  assert.equal(
    registrationCallback(
      "https://a.invalid/#type=recovery&access_token=a&refresh_token=b",
    ).kind,
    "invalid",
  );
  const user = { id: uid, email_confirmed_at: "today" };
  const s = { user };
  assert.deepEqual(
    await registrationConfirmation(
      {
        getSession: async () => ({ data: { session: s } }),
        getUser: async () => ({ data: { user } }),
      },
      { kind: "none" },
    )(),
    s,
  );
  await assert.rejects(
    registrationConfirmation(
      {
        getSession: async () => ({ data: { session: s } }),
        getUser: async () => ({ data: { user: { ...user, id: sid } } }),
      },
      { kind: "none" },
    )(),
    /confirmation_login_required/,
  );
});
test("pending marker survives session loss without storing email/password/token and storage refusal is safe", () => {
  const disk = new Map();
  const storage = {
    getItem: (k) => disk.get(k),
    setItem: (k, v) => disk.set(k, v),
    removeItem: (k) => disk.delete(k),
  };
  pendingRegistration(storage, true);
  assert.equal(pendingRegistration(storage), true);
  assert.deepEqual([...disk.values()], ["1"]);
  pendingRegistration(storage, false);
  assert.equal(pendingRegistration(storage), false);
  assert.equal(
    pendingRegistration({
      getItem() {
        throw Error("disabled");
      },
    }),
    false,
  );
});
