import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

const fixture = (name: string) => resolve(import.meta.dirname, `../../src/test/fixtures/${name}`);

async function reachExport(page: import("@playwright/test").Page) {
  await page.goto(".");
  await page.getByLabel("Choose audio…").setInputFiles(fixture("audio/short-valid.mp3"));
  await page
    .getByLabel("Canonical lyrics")
    .fill("First line\nCafé déjà vu\n[chorus]\nMissing warning line");
  await page.getByRole("button", { name: "Continue to transcription" }).click();
  await page.getByRole("button", { name: "Use deterministic transcript" }).click();
  await page.getByRole("button", { name: "Align lines" }).click();
  await page.getByRole("button", { name: "5. Edit" }).click();
  await expect(page.getByRole("heading", { name: "Timeline editor" })).toBeVisible();
  await expect(page.getByRole("button", { name: "7. Export" })).toBeEnabled();
  await page.getByRole("button", { name: "7. Export" }).click();
  await expect(page.getByRole("heading", { name: "Timed-text export" })).toBeVisible();
}

async function downloadText(page: import("@playwright/test").Page, buttonName: RegExp) {
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: buttonName }).click();
  const download = await downloadPromise;
  const path = await download.path();
  if (!path) throw new Error("Expected local download path.");
  return {
    suggestedName: download.suggestedFilename(),
    content: await readFile(path, "utf8"),
  };
}

test("exports LRC, enhanced LRC, SRT, VTT, and project JSON downloads", async ({ page }) => {
  await reachExport(page);

  const lrc = await downloadText(page, /Download Plain LRC/u);
  expect(lrc.suggestedName).toMatch(/short-valid\.lrc$/u);
  expect(lrc.content).toContain("[00:");
  expect(lrc.content).toContain("Café déjà vu");

  await page.getByLabel("Enhanced LRC").check();
  const enhanced = await downloadText(page, /Download Enhanced LRC/u);
  expect(enhanced.suggestedName).toMatch(/short-valid\.enhanced\.lrc$/u);
  expect(enhanced.content).toContain("<00:");

  await page.getByLabel("SubRip SRT").check();
  const srt = await downloadText(page, /Download SubRip SRT/u);
  expect(srt.suggestedName).toMatch(/short-valid\.srt$/u);
  expect(srt.content).toContain("-->");
  expect(srt.content).toContain("Café déjà vu");

  await page.getByLabel("WebVTT").check();
  const vtt = await downloadText(page, /Download WebVTT/u);
  expect(vtt.suggestedName).toMatch(/short-valid\.vtt$/u);
  expect(vtt.content.startsWith("WEBVTT")).toBe(true);

  await page.getByLabel("Project JSON").check();
  const projectJson = await downloadText(page, /Download Project JSON/u);
  const parsed = JSON.parse(projectJson.content) as { project: { audio?: unknown } };
  expect(projectJson.suggestedName).toMatch(/short-valid\.bolt95\.json$/u);
  expect(projectJson.content).not.toContain("data:");
  expect(parsed.project.audio).toBeTruthy();
});

test("subtitle export remains available without video APIs", async ({ page }) => {
  await page.addInitScript(() => {
    Reflect.deleteProperty(window, "VideoEncoder");
    Reflect.deleteProperty(window, "MediaRecorder");
  });
  await reachExport(page);
  const lrc = await downloadText(page, /Download Plain LRC/u);
  expect(lrc.content).toContain("First line");
});
