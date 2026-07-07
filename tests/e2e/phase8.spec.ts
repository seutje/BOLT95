import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

async function reachStyle(page: import("@playwright/test").Page) {
  await page.goto(".");
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await page
    .getByLabel("Canonical lyrics")
    .fill("First line\nCafé déjà vu\nA veryveryveryveryveryveryverylongword appears\nLast line");
  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await page.getByRole("button", { name: "Use deterministic transcript" }).click();
  await page.getByRole("button", { name: "Align lines" }).click();
  await page.getByRole("button", { name: "5. Edit" }).click();
  await expect(page.getByRole("button", { name: "6. Style" })).toBeEnabled();
  await page.getByRole("button", { name: "6. Style" }).click();
  await expect(page.getByRole("heading", { name: "Deterministic preview" })).toBeVisible();
}

test("style preview renders all ratios and stores only background metadata", async ({ page }) => {
  await reachStyle(page);

  const canvas = page.getByLabel("Lyric video preview");
  await expect(canvas).toBeVisible();
  await page.getByLabel("Preset").selectOption("square-draft");
  await expect(canvas).toHaveJSProperty("width", 540);
  await expect(canvas).toHaveJSProperty("height", 540);
  await page.getByLabel("Preset").selectOption("portrait-draft");
  await expect(canvas).toHaveJSProperty("width", 540);
  await expect(canvas).toHaveJSProperty("height", 960);
  await page.getByLabel("Preset").selectOption("landscape-draft");
  await expect(canvas).toHaveJSProperty("width", 960);
  await expect(canvas).toHaveJSProperty("height", 540);

  await page.getByLabel("Current time").fill("0");
  await page.getByRole("button", { name: "Play" }).click();
  await expect
    .poll(async () => Number(await page.getByLabel("Current time").inputValue()))
    .toBeGreaterThan(0);
  await page.getByRole("button", { name: "Pause" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();

  await page.getByLabel("Font", { exact: true }).selectOption("serif");
  await page.getByLabel("Transition").selectOption("none");
  await page.getByLabel("Alignment").selectOption("left");
  await page.getByLabel("Word highlight").uncheck();
  await page.getByLabel("High contrast").check();
  await page.getByLabel("Safe area").check();
  await page.getByLabel("Background image").setInputFiles({
    name: "background.png",
    mimeType: "image/png",
    buffer: Buffer.from([
      0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
      0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x02, 0x00, 0x00, 0x00, 0x90,
      0x77, 0x53, 0xde, 0x00, 0x00, 0x00, 0x0c, 0x49, 0x44, 0x41, 0x54, 0x08, 0xd7, 0x63, 0xf8,
      0xcf, 0xc0, 0x00, 0x00, 0x03, 0x01, 0x01, 0x00, 0x18, 0xdd, 0x8d, 0xb0, 0x00, 0x00, 0x00,
      0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]),
  });
  await expect(page.getByText("metadata only")).toBeVisible();

  await page.getByRole("button", { name: "7. Export" }).click();
  await page.getByLabel("Project JSON").check();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Download Project JSON/u }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Expected local download path.");
  const json = await readFile(path, "utf8");
  expect(json).toContain("background.png");
  expect(json).not.toContain("data:");
  expect(json).not.toContain("blob:");
});
