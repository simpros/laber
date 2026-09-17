import { expect, STORAGE_STATE_USER, test } from "./fixtures";

test.describe("Navigation", () => {
  test.use({ storageState: STORAGE_STATE_USER });

  test("should navigate to dashboard", async ({ page }) => {
    await page.goto("/");
    await expect(page).toHaveURL("/");
    await expect(page).not.toHaveURL(/login/);
  });

  test("should navigate to stacks page", async ({ page }) => {
    await page.goto("/stacks");
    await expect(page).toHaveURL("/stacks");
  });

  test("should navigate to core page", async ({ page }) => {
    await page.goto("/core");
    await expect(page).toHaveURL("/core");
  });

  test("should navigate to settings page", async ({ page }) => {
    await page.goto("/settings/repository");
    await expect(page).toHaveURL("/settings/repository");
  });
});
