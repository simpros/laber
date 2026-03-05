import { test as base, type Page } from "@playwright/test";

export { waitForHydration } from "./utils";

// Test user credentials — seeded by global setup
export { TEST_USER, TEST_ADMIN } from "./credentials";

// Storage state paths
export const STORAGE_STATE_USER = "tests/.auth/user.json";
export const STORAGE_STATE_ADMIN = "tests/.auth/admin.json";
export const STORAGE_STATE_GUEST = "tests/.auth/guest.json";

// Extended test — add page-object fixtures here as needed
export const test = base.extend({});

export { expect } from "@playwright/test";

/**
 * Login helper for tests that need a fresh login.
 */
export async function loginAsUser(
  page: Page,
  email: string,
  password: string,
): Promise<void> {
  await page.goto("/auth/login");
  await page.locator("#email").fill(email);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForURL(/(?!.*auth\/login).*/, { timeout: 10_000 });
}

/**
 * Logout by clearing cookies, then navigating to trigger redirect.
 */
export async function logout(page: Page): Promise<void> {
  await page.context().clearCookies();
  await page.goto("/");
  await page.waitForURL(/auth\/login/, { timeout: 5_000 });
}
