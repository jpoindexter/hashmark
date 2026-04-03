import { test, expect } from "@playwright/test";

test("API health endpoint returns ok", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.ok).toBe(true);
});

test("API info endpoint returns project metadata", async ({ request }) => {
  const response = await request.get("/api/info");
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body).toHaveProperty("version");
});
