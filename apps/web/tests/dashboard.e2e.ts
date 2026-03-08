import { expect, STORAGE_STATE_USER, test } from "./fixtures";

test.describe("Dashboard", () => {
  test.use({ storageState: STORAGE_STATE_USER });

  test("should display dashboard heading", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Dashboard" })
    ).toBeVisible();
    await expect(
      page.getByText("Overview of your homelab infrastructure")
    ).toBeVisible();
  });

  test("should display stat cards", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByText("Total Stacks")).toBeVisible();
    await expect(page.getByText("Deployed")).toBeVisible();
    await expect(page.getByText("Repositories")).toBeVisible();
  });

  test("should display Core Services section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Core Services" })
    ).toBeVisible();
  });

  test("should display Recent Activity section", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByRole("heading", { name: "Recent Activity" })
    ).toBeVisible();
  });

  test("should show core stack not configured message", async ({ page }) => {
    await page.goto("/");

    await expect(
      page.getByText("Core stack not configured")
    ).toBeVisible();
  });

  test("should have navigation sidebar links", async ({ page }) => {
    await page.goto("/");

    await expect(page.getByRole("link", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Stacks" })).toBeVisible();
    await expect(
      page.getByRole("link", { name: "Core Services" })
    ).toBeVisible();
  });
});
