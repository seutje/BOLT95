import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

async function reachEditor(page: import("@playwright/test").Page) {
  await page.goto(".");
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await page.getByLabel("Canonical lyrics").fill("First line\nCafé déjà vu\nMissing warning line");
  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await page.getByRole("button", { name: "Use deterministic transcript" }).click();
  await page.getByRole("button", { name: "Align lines" }).click();
  await expect(page.getByRole("heading", { name: "Timed lines" })).toBeVisible();
  await page.getByRole("button", { name: "5. Edit" }).click();
  await expect(page.getByRole("heading", { name: "Timeline editor" })).toBeVisible();
}

test("timeline edits are undoable, autosaved, restorable, and relinkable", async ({ page }) => {
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await reachEditor(page);

  await page.getByRole("button", { name: "Play" }).click();
  await page.waitForTimeout(250);
  expect(
    pageErrors.filter((message) => /NotSupportedError|supported sources/u.test(message)),
  ).toEqual([]);
  await expect(page.getByText(/Playback failed/u)).toHaveCount(0);

  const firstLine = page.locator(".timeline-table textarea").first();
  await firstLine.fill("Corrected first line");
  await expect(firstLine).toHaveValue("Corrected first line");
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(firstLine).toHaveValue("First line");
  await page.getByRole("button", { name: "Redo" }).click();
  await expect(firstLine).toHaveValue("Corrected first line");

  await page.getByLabel(/Start time Café/u).fill("0.500");
  await expect(page.getByText(/overlap/u)).toBeVisible();
  await page.getByLabel(/Start time Café/u).fill("1.200");
  await page.getByRole("button", { name: "Reviewed" }).first().click();
  await expect(page.getByText("Autosaved locally.")).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: /Resume short-valid/u }).click();
  await expect(page.getByRole("heading", { name: "Timeline editor" })).toBeVisible();
  await expect(page.locator(".timeline-table textarea").first()).toHaveValue(
    "Corrected first line",
  );
  await expect(page.getByText(/Audio is not linked/u)).toBeVisible();

  await page.getByLabel("Relink audio").setInputFiles(fixture("audio/short-valid.mp3"));
  await expect(page.getByText(/fingerprint matches/u)).toBeVisible();
  await page.getByLabel("Relink audio").setInputFiles(fixture("audio/corrupt.mp3"));
  await expect(page.getByText(/does not match/u)).toBeVisible();

  await page.getByLabel("Import JSON").setInputFiles({
    name: "future.bolt95.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify({ schemaVersion: 99 })),
  });
  await expect(page.getByText(/Unsupported project file schema version/u)).toBeVisible();
  await expect(page.locator(".timeline-table textarea").first()).toHaveValue(
    "Corrected first line",
  );

  await page.getByRole("button", { name: "Clear local data" }).click();
  await expect(page.getByText(/Local project data cleared/u)).toBeVisible();
});
