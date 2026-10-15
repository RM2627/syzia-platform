import test from "node:test";
import assert from "node:assert/strict";
import {
  recoveryStorage,
  recoveryStorageKey as key,
  recoveryCallback,
  recoveryMessage,
  createRecovery,
} from "../../src/access/recovery-core.ts";
const tokenHash = "fictional_recovery_hash_".padEnd(64, "a");
const code = "fictional-recovery-code-1234567890";
const user = {
  id: "11111111-1111-4111-8111-111111111111",
  is_anonymous: false,
};
function fixture(overrides = {}) {
  const persistent = new Map(),
    calls = [];
  const disk = {
    getItem: (k) => persistent.get(k) ?? null,
    setItem: (k, v) => persistent.set(k, v),
    removeItem: (k) => persistent.delete(k),
  };
  const storage = recoveryStorage(disk);
  const session = {
    user,
    access_token: "fixture-only",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
  };
  const auth = {
    resetPasswordForEmail: async (...args) => {
      calls.push(["recover", ...args]);
      return { error: null };
    },
    verifyOtp: async (arg) => {
      calls.push(["verify", arg]);
      return { data: { session, user }, error: null };
    },
    exchangeCodeForSession: async (arg) => {
      calls.push(["exchange", arg]);
      return { data: { session, user, redirectType: "recovery" }, error: null };
    },
    getUser: async () => ({ data: { user }, error: null }),
    updateUser: async (arg) => {
      calls.push(["update", arg]);
      return { data: { user }, error: null };
    },
    signOut: async (arg) => {
      calls.push(["signOut", arg]);
      return { error: null };
    },
    ...overrides,
  };
  return {
    r: createRecovery(auth, storage),
    storage,
    persistent,
    calls,
    session,
  };
}
test("R01 request uses fixed same-origin redirect and passes CAPTCHA without logging", async () => {
  const f = fixture();
  await f.r.request(
    " owner@example.invalid ",
    "https://app.example.invalid/path",
    "mock-captcha",
  );
  assert.deepEqual(f.calls, [
    [
      "recover",
      "owner@example.invalid",
      {
        redirectTo: "https://app.example.invalid/atualizar-senha",
        captchaToken: "mock-captcha",
      },
    ],
  ]);
});
test("R02 existing/nonexistent accounts receive identical success behavior", async () => {
  for (const error of [
    null,
    { code: "user_not_found" },
    { code: "email_not_confirmed" },
  ]) {
    const f = fixture({ resetPasswordForEmail: async () => ({ error }) });
    assert.equal(
      await f.r.request(
        "nobody@example.invalid",
        "https://app.example.invalid",
      ),
      undefined,
    );
  }
});
test("R03 invalid email and unsafe origin never request an email", async () => {
  const f = fixture();
  for (const email of [
    "",
    "x",
    "a@b",
    "a\nb@example.invalid",
    "a@example.invalid,other",
  ])
    await assert.rejects(f.r.request(email, "https://app.example.invalid"));
  await assert.rejects(
    f.r.request("a@example.invalid", "http://untrusted.invalid"),
  );
  assert.equal(f.calls.length, 0);
});
test("R04 strict recovery callbacks accept code or recovery hash", () => {
  assert.deepEqual(
    recoveryCallback(
      "https://app.example.invalid/atualizar-senha?code=" + code,
    ),
    { kind: "code", value: code },
  );
  assert.deepEqual(
    recoveryCallback(
      "https://app.example.invalid/atualizar-senha#token_hash=" +
        tokenHash +
        "&type=recovery",
    ),
    { kind: "hash", value: tokenHash },
  );
});
for (const suffix of [
  "",
  "?type=invite&token_hash=" + tokenHash,
  "?code=" + code + "&next=https://evil.invalid",
  "?code=" + code + "&code=" + code,
  "?code=" + code + "#token_hash=" + tokenHash + "&type=recovery",
  "#access_token=fake&refresh_token=fake&type=recovery",
  "?error=expired",
  "?token_hash=" + tokenHash + "&type=recovery#type=recovery",
])
  test(
    "R05 rejects malformed/invite/mixed/open-redirect callback " +
      suffix.split("=")[0],
    () =>
      assert.throws(() =>
        recoveryCallback(
          "https://app.example.invalid/atualizar-senha" + suffix,
        ),
      ),
  );
test("R06 stored application session alone never permits update", async () => {
  const f = fixture();
  f.storage.setItem(key, JSON.stringify(f.session));
  await assert.rejects(
    f.r.update("FictitiousPassword123!", "FictitiousPassword123!"),
  );
  assert.equal(f.calls.length, 0);
});
test("R07 official hash proof + getUser permits password-only update, local signout, no grants", async () => {
  const f = fixture();
  await f.r.verify({ kind: "hash", value: tokenHash });
  await f.r.update("FictitiousPassword123!", "FictitiousPassword123!");
  assert.deepEqual(
    f.calls.map((x) => x[0]),
    ["verify", "update", "signOut"],
  );
  assert.deepEqual(f.calls[1][1], { password: "FictitiousPassword123!" });
  assert.deepEqual(f.calls[2][1], { scope: "local" });
  await assert.rejects(
    f.r.update("FictitiousPassword456!", "FictitiousPassword456!"),
  );
});
test("R08 PKCE requires locally issued recovery verifier, not login or invite verifier", async () => {
  const f = fixture();
  await assert.rejects(f.r.verify({ kind: "code", value: code }));
  f.storage.setItem(
    key + "-code-verifier",
    JSON.stringify("fictional-verifier"),
  );
  await assert.rejects(f.r.verify({ kind: "code", value: code }));
  assert.equal(f.calls.length, 0);
  f.storage.setItem(
    key + "-code-verifier",
    JSON.stringify("fictional-verifier/recovery"),
  );
  await f.r.verify({ kind: "code", value: code });
  assert.equal(f.calls[0][0], "exchange");
});
test("R09 exchange response must identify recovery", async () => {
  const f = fixture({
    exchangeCodeForSession: async () => ({
      data: { redirectType: "invite" },
      error: null,
    }),
  });
  f.storage.setItem(
    key + "-code-verifier",
    JSON.stringify("fictional/recovery"),
  );
  await assert.rejects(f.r.verify({ kind: "code", value: code }));
  await assert.rejects(
    f.r.update("FictitiousPassword123!", "FictitiousPassword123!"),
  );
});
test("R10 expired/consumed links and divergent/anonymous users do not permit update", async () => {
  for (const override of [
    { verifyOtp: async () => ({ error: { code: "otp_expired" } }) },
    {
      verifyOtp: async () => ({
        data: { session: { user, expires_at: 1 } },
        error: null,
      }),
    },
    {
      getUser: async () => ({
        data: { user: { ...user, id: "other" } },
        error: null,
      }),
    },
    {
      getUser: async () => ({
        data: { user: { ...user, is_anonymous: true } },
        error: null,
      }),
    },
    { getUser: async () => ({ data: { user: null }, error: { status: 401 } }) },
  ]) {
    const f = fixture(override);
    await assert.rejects(f.r.verify({ kind: "hash", value: tokenHash }));
    await assert.rejects(
      f.r.update("FictitiousPassword123!", "FictitiousPassword123!"),
    );
    assert.ok(!f.calls.some((x) => x[0] === "update"));
  }
});
test("R11 mismatching/short/long passwords are rejected without update", async () => {
  const f = fixture();
  await f.r.verify({ kind: "hash", value: tokenHash });
  for (const [a, b] of [
    ["short", "short"],
    ["a".repeat(129), "a".repeat(129)],
    ["a".repeat(12), "b".repeat(12)],
  ])
    await assert.rejects(f.r.update(a, b));
  assert.ok(!f.calls.some((x) => x[0] === "update"));
});
test("R12 rate limit, CAPTCHA, provider and network errors are friendly and never echo raw secrets", () => {
  assert.match(recoveryMessage({ status: 429 }), /Muitas tentativas/);
  assert.match(recoveryMessage({ code: "captcha_failed" }), /verificação/);
  for (const e of [
    { message: "fixture-token owner@example.invalid" },
    { code: "unexpected", message: "private" },
  ])
    assert.doesNotMatch(recoveryMessage(e), /fixture-token|owner@|private/);
});
test("R13 concurrent submission is rejected; retry after network failure is possible", async () => {
  let end;
  const f = fixture({
    resetPasswordForEmail: () =>
      new Promise((resolve) => {
        end = resolve;
      }),
  });
  const first = f.r.request("a@example.invalid", "https://app.example.invalid");
  await assert.rejects(
    f.r.request("a@example.invalid", "https://app.example.invalid"),
    /busy/,
  );
  end({ error: { status: 503 } });
  await assert.rejects(first);
  const retry = f.r.request("a@example.invalid", "https://app.example.invalid");
  end({ error: null });
  await retry;
});
test("R14 only short-lived verifier persists; tokens and unrelated app session stay separate", () => {
  let now = 0;
  const disk = new Map();
  disk.set("app-auth", "unchanged");
  const s = recoveryStorage(
    {
      getItem: (k) => disk.get(k) ?? null,
      setItem: (k, v) => disk.set(k, v),
      removeItem: (k) => disk.delete(k),
    },
    () => now,
  );
  s.setItem(key, "sensitive fixture session");
  s.setItem(key + "-code-verifier", JSON.stringify("fictional/recovery"));
  assert.equal(disk.has(key), false);
  assert.equal(s.getItem(key), "sensitive fixture session");
  s.clearSession();
  assert.equal(s.getItem(key), null);
  now = 3600001;
  assert.equal(s.getItem(key + "-code-verifier"), null);
  assert.equal(disk.get("app-auth"), "unchanged");
});
test("R15 disposing the recovery flow removes permission to update", async () => {
  const f = fixture();
  await f.r.verify({ kind: "hash", value: tokenHash });
  f.r.dispose();
  await assert.rejects(
    f.r.update("FictitiousPassword123!", "FictitiousPassword123!"),
  );
});
