import { test } from "node:test";
import assert from "node:assert/strict";
import { companyImageBytes } from "../src/consumer/company-image-request.ts";
test("Private media: concurrent reads share only within the same authorization and company/permissions scope", async () => {
  const original = globalThis.fetch;
  const pending = [];
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Promise((resolve) => pending.push(resolve));
  };
  try {
    const a = companyImageBytes(
      "https://fixture.invalid/image",
      "Bearer synthetic-A",
      "org-A:admin:grants-1:plan-1",
    );
    const same = companyImageBytes(
      "https://fixture.invalid/image",
      "Bearer synthetic-A",
      "org-A:admin:grants-1:plan-1",
    );
    assert.equal(a, same);
    const otherOrg = companyImageBytes(
      "https://fixture.invalid/image",
      "Bearer synthetic-A",
      "org-B:admin:grants-1:plan-1",
    );
    const otherSession = companyImageBytes(
      "https://fixture.invalid/image",
      "Bearer synthetic-B",
      "org-A:admin:grants-1:plan-1",
    );
    const revoked = companyImageBytes(
      "https://fixture.invalid/image",
      "Bearer synthetic-A",
      "org-A:collaborator:grants-2:plan-2",
    );
    assert.equal(calls, 4);
    for (const resolve of pending) resolve(new Response("synthetic bytes"));
    await Promise.all([a, same, otherOrg, otherSession, revoked]);
  } finally {
    globalThis.fetch = original;
  }
});
test("Private media: settled results are never retained across later authorization checks", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("synthetic bytes");
  };
  try {
    await companyImageBytes(
      "https://fixture.invalid/reload",
      "Bearer synthetic",
      "scope",
    );
    await companyImageBytes(
      "https://fixture.invalid/reload",
      "Bearer synthetic",
      "scope",
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
test("Private media: denial is shared only in flight and a subsequent retry reaches the server", async () => {
  const original = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    return new Response("denied", { status: 403 });
  };
  try {
    const a = companyImageBytes(
      "https://fixture.invalid/denied",
      "Bearer synthetic",
      "scope",
    );
    const b = companyImageBytes(
      "https://fixture.invalid/denied",
      "Bearer synthetic",
      "scope",
    );
    await assert.rejects(a, /image_unavailable/);
    await assert.rejects(b, /image_unavailable/);
    assert.equal(calls, 1);
    await assert.rejects(
      companyImageBytes(
        "https://fixture.invalid/denied",
        "Bearer synthetic",
        "scope",
      ),
    );
    assert.equal(calls, 2);
  } finally {
    globalThis.fetch = original;
  }
});
