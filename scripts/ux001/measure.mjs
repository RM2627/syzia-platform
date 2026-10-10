import { browser, out, context, measure, login, settle } from "./harness.mjs";
import assert from "node:assert/strict";
const after = !process.argv[2]?.startsWith("before");
try {
  for (const width of [1440, 390, 320]) {
    const { c, p } = await context(width);
    await login(p, "admin@example.invalid");
    await p.goto("/app");
    await settle(p);
    const base = await p
      .locator(".org-card")
      .filter({ hasText: "ms-auto-ficticia" })
      .getAttribute("href");
    await p.goto(base + "/atendimento");
    await settle(p);
    await p.getByRole("button", { name: "Todos", exact: true }).click();
    await settle(p);
    const first = p.locator("a.h-ticket").first();
    const firstCode = (await first.getAttribute("href"))
      .split(/ticket=|\/central\//)
      .at(-1);
    const open = await measure(p, `open-${width}`, () => first.click());
    assert.equal(open.status, "RECORDED");
    let extraClicks = 0;
    if (
      (await p.locator(".central > .h-tabs .selected").innerText()) !== "Todos"
    ) {
      await p.getByRole("button", { name: "Todos", exact: true }).click();
      await settle(p);
      extraClicks++;
    }
    const second = p
      .locator("a.h-ticket")
      .filter({ hasNot: p.locator(".not-used") });
    const links = await second.evaluateAll((es) =>
      es.map((e) => e.getAttribute("href")),
    );
    const href = links.find((h) => !h.includes(firstCode));
    const switched = await measure(p, `switch-${width}`, () =>
      p.locator(`a[href="${href}"]`).click(),
    );
    switched.extraClicksToRestoreQueue = extraClicks;
    await measure(p, `back-${width}`, () => p.goBack());
    await measure(p, `forward-${width}`, () => p.goForward());
    await measure(p, `reload-${width}`, () => p.reload());
    if (after) {
      assert.ok(p.url().includes(base + "/atendimento?ticket="));
      assert.equal(extraClicks, 0);
      assert.ok(open.final.companyNav);
      assert.ok(!open.frames.some((f) => f.companyNav === false));
      assert.equal(
        open.requests.filter((r) => r.path.endsWith("/central_context")).length,
        1,
      );
      assert.equal(
        open.requests.filter((r) => r.path.endsWith("/central_queue")).length,
        0,
      );
      assert.equal(
        switched.requests.filter((r) => r.path.endsWith("/central_context"))
          .length,
        1,
      );
      assert.equal(
        switched.requests.filter((r) => r.path.endsWith("/central_queue"))
          .length,
        0,
      );
    }
    await c.tracing.stop({ path: `${out}/navigation-${width}-trace.zip` });
    await c.close();
  }
} finally {
  await browser.close();
}
