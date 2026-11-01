import { test, expect } from "@playwright/test";

async function openDashboard(page) {
  await page.goto("/");
  await page.getByRole("button", { name: /Sign in with email/i }).click();
  await page.getByPlaceholder("e.g. Arielle").fill("Arielle");
  await page.getByRole("button", { name: "K1", exact: true }).click();
  await page.getByPlaceholder("e.g. My First Skool Tampines").fill("Little Sprouts");
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByRole("heading", { name: "Your family checklist" })).toBeVisible();
}

test("parent can filter tasks by child and reset to everyone", async ({ page }) => {
  await openDashboard(page);
  await page.getByRole("group", { name: "Filter by child" }).getByRole("button", { name: "Lucas" }).click();
  await expect(page.getByText("Pack extra clothes for water play")).toBeVisible();
  await expect(page.getByText("Bring one clean cardboard box")).toHaveCount(0);
  await page.getByRole("group", { name: "Filter by child" }).getByRole("button", { name: "Everyone" }).click();
  await expect(page.getByText("Bring one clean cardboard box")).toBeVisible();
});

test("ordinary tasks can be completed and reopened", async ({ page }) => {
  await openDashboard(page);
  const done = page.getByRole("button", { name: "Mark done: Bring one clean cardboard box" });
  await done.click();
  await expect(page.getByRole("button", { name: "Mark not done: Bring one clean cardboard box" })).toBeVisible();
  await page.getByRole("button", { name: "Mark not done: Bring one clean cardboard box" }).click();
  await expect(done).toBeVisible();
});

test("consent cannot be completed through the checklist and preview does not submit", async ({ page }) => {
  await openDashboard(page);
  await expect(page.getByRole("button", { name: /Consent requires submission: Submit Wildlings/ })).toBeDisabled();
  await page.getByRole("button", { name: /Sign/i, exact: true }).click();
  await page.getByPlaceholder("e.g. Tan Mei Ling").fill("Mei Ling Tan");
  await page.getByPlaceholder("+65 9XXX XXXX").fill("91234567");
  await page.locator("label").filter({ hasText: "I agree to the terms above" }).locator("div").click();
  await page.getByRole("button", { name: /Preview consent/ }).click();
  await expect(page.getByText("Demo consent preview only")).toBeVisible();
  await expect(page.getByText(/No consent was sent or recorded/)).toBeVisible();
});

test("parent checklist fits a narrow mobile viewport without horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await openDashboard(page);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(overflow).toBe(false);
});
