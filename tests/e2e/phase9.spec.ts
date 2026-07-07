import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

async function reachExport(page: import("@playwright/test").Page) {
  await page.goto(".");
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await page.getByLabel("Canonical lyrics").fill("First line\nSecond line\nLast line");
  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await page.getByRole("button", { name: "Use deterministic transcript" }).click();
  await page.getByRole("button", { name: "Align lines" }).click();
  await page.getByRole("button", { name: "5. Edit" }).click();
  await expect(page.getByRole("button", { name: "7. Export" })).toBeEnabled();
  await page.getByRole("button", { name: "7. Export" }).click();
  await expect(page.getByRole("heading", { name: "Timed-text export" })).toBeVisible();
}

test("exports a verified draft WebM and downloads it", async ({ page }) => {
  test.setTimeout(90_000);
  await reachExport(page);
  await page.getByLabel("Landscape draft").check();
  const exportButton = page.getByRole("button", { name: "Export Draft WebM" });
  await expect(exportButton).toBeEnabled({ timeout: 15_000 });
  await exportButton.click();
  await expect(page.getByRole("button", { name: "Download Draft WebM" })).toBeEnabled({
    timeout: 60_000,
  });
  await expect(page.getByText(/drift \d+ ms/u)).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download Draft WebM" }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.landscape-draft\.draft\.webm$/u);
  const path = await download.path();
  if (!path) throw new Error("Expected local download path.");
  const bytes = await readFile(path);
  expect(bytes.subarray(0, 4).toString("hex")).toBe("1a45dfa3");
});

test("draft WebM export can be cancelled and restarted", async ({ page }) => {
  test.setTimeout(90_000);
  await page.addInitScript(() => {
    const original = window.requestAnimationFrame.bind(window);
    window.requestAnimationFrame = (callback) =>
      window.setTimeout(() => original(callback), 30) as unknown as number;
  });
  await reachExport(page);
  const exportButton = page.getByRole("button", { name: "Export Draft WebM" });
  await expect(exportButton).toBeEnabled({ timeout: 15_000 });
  await exportButton.click();
  await page.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Draft export cancelled.")).toBeVisible({ timeout: 15_000 });
  await exportButton.click();
  await expect(page.getByRole("button", { name: "Download Draft WebM" })).toBeEnabled({
    timeout: 60_000,
  });
});

test("unsupported video APIs keep subtitle export available", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "VideoEncoder");
    Reflect.deleteProperty(window, "AudioEncoder");
  });
  await reachExport(page);
  await expect(page.getByRole("button", { name: "Export Draft WebM" })).toBeDisabled();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Plain LRC/u }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.lrc$/u);
});
