import {
  expect,
  loginAsUser,
  STORAGE_STATE_GUEST,
  test,
  TEST_USER,
} from "./fixtures";

test.describe("Logout", () => {
  test.use({ storageState: STORAGE_STATE_GUEST });

  test("should show sign out button", async ({ page }) => {
    await loginAsUser(page, TEST_USER.email, TEST_USER.password);

    await expect(
      page.locator("button[title='Sign out']")
    ).toBeVisible();
  });

  test("should redirect to login after signing out", async ({ page }) => {
    await loginAsUser(page, TEST_USER.email, TEST_USER.password);

    await page.locator("button[title='Sign out']").click();

    await expect(page).toHaveURL(/login/, { timeout: 10_000 });
  });
});
