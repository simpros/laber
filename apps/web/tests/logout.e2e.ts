import { expect, STORAGE_STATE_USER, test } from "./fixtures";

test.describe("Logout", () => {
  test.use({ storageState: STORAGE_STATE_USER });

  test("should show sign out button", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.locator("button[title='Sign out']")
    ).toBeVisible();
  });

  test("should redirect to login after signing out", async ({ page }) => {
    await page.goto("/");

    await page.locator("button[title='Sign out']").click();

    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
