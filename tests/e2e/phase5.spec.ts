import { resolve } from "node:path";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

test.beforeEach(async ({ page }) => {
  await page.goto(".");
  await expect(page.getByRole("heading", { name: "Add audio and lyrics" })).toBeVisible();
});

test("audio plus supplied lyrics reaches review without mutating canonical text", async ({
  page,
}) => {
  const privateRequests: string[] = [];
  page.on("request", (request) => {
    if (/short-valid|timed\.lrc|lyrics|transcript|\.mp3/iu.test(request.url())) {
      privateRequests.push(request.url());
    }
  });

  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await page.getByLabel("Canonical lyrics").fill("First line\nCafé déjà vu\nMissing warning line");
  const importedText = await page.getByLabel("Canonical lyrics").inputValue();
  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await page.getByRole("button", { name: "Use deterministic transcript" }).click();

  await expect(page.getByRole("heading", { name: "Review timed lyric lines" })).toBeVisible();
  await expect(page.locator(".canonical-preview")).toContainText(importedText);
  await page.getByRole("button", { name: "Align lines" }).click();
  await expect(page.getByRole("heading", { name: "Timed lines" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Café déjà vu" })).toBeVisible();
  await expect(page.getByText(/Unresolved export warnings/u)).toBeVisible();

  await page.getByRole("button", { name: "Next low-confidence line" }).click();
  await expect(page.locator("tbody tr:focus")).toHaveCount(1);

  expect(privateRequests).toEqual([]);
  const accessibility = await new AxeBuilder({ page }).analyze();
  expect(accessibility.violations).toEqual([]);
});

test("audio-only flow derives editable transcript lines and can retry alignment", async ({
  page,
}) => {
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await page.getByRole("button", { name: "Use deterministic transcript" }).click();

  await expect(page.getByLabel("Editable transcript lines")).toContainText("First line");
  await page.getByLabel("Editable transcript lines").fill("First line\nCafé déjà vu\nHello world");
  await page.getByRole("button", { name: "Align lines" }).click();
  await expect(page.getByRole("heading", { name: "Timed lines" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Hello world" })).toBeVisible();

  await page.getByRole("button", { name: "Retry alignment" }).click();
  await expect(page.getByRole("heading", { name: "Timed lines" })).toBeVisible();
  await expect(page.getByText("3 timed lines")).toBeVisible();
});
