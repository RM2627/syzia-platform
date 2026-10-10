import { test as base, expect } from "@playwright/test";
// Each browser case gets an independent rate window. The production gateway has no reset endpoint.
export const test = base.extend<{ accessRateIsolation: void }>({
  accessRateIsolation: [
    async ({ request }, use) => {
      const response = await request.post(
        "http://127.0.0.1:54321/__test/reset-access-limits",
      );
      expect(response.ok()).toBeTruthy();
      await use();
    },
    { auto: true },
  ],
});
export { expect };
