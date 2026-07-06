import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.goto(".");
  await expect(page.getByRole("heading", { name: "3. Alignment fixture viewer" })).toBeVisible();
});

test("shows exact alignment provenance and confidence", async ({ page }) => {
  await expect(page.getByLabel("Fixture", { exact: true })).toHaveValue("exact");
  await expect(page.getByRole("cell", { name: "Hello world" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "transcript-exact" }).first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Accepted" }).first()).toBeVisible();
});

test("marks repeated chorus fixtures ambiguous", async ({ page }) => {
  await page.getByLabel("Fixture", { exact: true }).selectOption("repeated-chorus");
  await expect(
    page.getByText("Repeated lyric blocks were marked ambiguous for review."),
  ).toBeVisible();
  await expect(page.getByRole("cell", { name: "Ambiguous" }).first()).toBeVisible();
});

test("flags wrong-song lyrics as low confidence", async ({ page }) => {
  await page.getByLabel("Fixture", { exact: true }).selectOption("wrong-song");
  await expect(
    page.getByText("Most supplied lyrics did not match the transcript evidence."),
  ).toBeVisible();
});
