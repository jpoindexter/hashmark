import { test, expect } from "@playwright/test";

test("app shell loads without errors", async ({ page }) => {
  // Wait for the server to respond before navigating
  await page.waitForResponse((res) =>
    res.url().includes("/api/health") && res.status() === 200
  );

  await page.goto("/");

  // Wait for the activity bar / rail to appear — confirms the shell rendered
  await page.waitForSelector("[data-testid='activity-bar'], .rail, [class*='rail']");
});

test("sessions sidebar renders", async ({ page }) => {
  await page.goto("/");

  // Wait for the sessions list container to appear
  await page.waitForSelector("[data-testid='sessions-sidebar'], [class*='sessions'], [class*='sidebar']");
});

test("new session button is reachable", async ({ page }) => {
  await page.goto("/");

  // Wait for the + / new session button by title attribute
  const newBtn = page.locator("[title='New mission'], [title='New session'], [aria-label='New mission']").first();
  await newBtn.waitFor({ state: "visible" });
  expect(await newBtn.isEnabled()).toBe(true);
});
