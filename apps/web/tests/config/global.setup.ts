import { test as setup, expect } from "@playwright/test";
import { TEST_USER } from "../fixtures/credentials";

setup("create test user via setup page", async ({ page }) => {
  await page.goto("/login");
  await page.waitForURL(/setup/, { timeout: 10_000 });

  await page.locator("#name").fill(TEST_USER.name);
  await page.locator("#email").fill(TEST_USER.email);
  await page.locator("#password").fill(TEST_USER.password);
  await page.getByRole("button", { name: /create account/i }).click();

  await page.waitForURL(/(?!.*setup).*/, { timeout: 10_000 });
  await expect(page).not.toHaveURL(/setup/);
});
