import type { FrameLyrics, FrameWord } from "./timing";
import { getRenderPreset, type RenderPresetDefinition } from "./presets";
import type { VisualTheme } from "./schema";

export interface TextRunLayout {
  readonly text: string;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly active: boolean;
}

export interface TextLineLayout {
  readonly role: "previous" | "current" | "next";
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly fontSize: number;
  readonly text: string;
  readonly runs: readonly TextRunLayout[];
}

export interface FrameLayout {
  readonly preset: RenderPresetDefinition;
  readonly safeArea: RenderPresetDefinition["safeArea"];
  readonly lines: readonly TextLineLayout[];
}

interface Segment {
  readonly text: string;
  readonly active: boolean;
}

const wordPattern = /[\p{L}\p{N}]+(?:['’`´-][\p{L}\p{N}]+)*/gu;

function fontSizeFor(preset: RenderPresetDefinition, theme: VisualTheme): number {
  const base = Math.min(preset.width, preset.height) * 0.084;
  return Math.round(base * theme.fontScale);
}

function segmentWidth(segment: Segment, fontSize: number): number {
  let units = 0;
  for (const char of segment.text) {
    units += /\s/u.test(char)
      ? 0.34
      : /[ilI.,'’]/u.test(char)
        ? 0.32
        : /[MW@#]/u.test(char)
          ? 0.88
          : 0.62;
  }
  return units * fontSize;
}

function splitLongText(text: string, fontSize: number, maxWidth: number): readonly string[] {
  const maxUnits = Math.max(1, Math.floor(maxWidth / (fontSize * 0.62)));
  const chars = [...text];
  const chunks: string[] = [];
  for (let index = 0; index < chars.length; index += maxUnits) {
    chunks.push(chars.slice(index, index + maxUnits).join(""));
  }
  return chunks;
}

function lineSegments(
  text: string,
  words: readonly FrameWord[],
  startWordIndex: number,
): { readonly segments: readonly Segment[]; readonly nextWordIndex: number } {
  if (words.length === 0) {
    return { segments: [{ text, active: false }], nextWordIndex: startWordIndex };
  }
  const segments: Segment[] = [];
  let last = 0;
  let wordIndex = startWordIndex;
  for (const match of text.matchAll(wordPattern)) {
    const index = match.index ?? 0;
    if (index > last) segments.push({ text: text.slice(last, index), active: false });
    segments.push({ text: match[0], active: words[wordIndex]?.active === true });
    last = index + match[0].length;
    wordIndex += 1;
  }
  if (last < text.length) segments.push({ text: text.slice(last), active: false });
  return {
    segments: segments.length > 0 ? segments : [{ text, active: false }],
    nextWordIndex: wordIndex,
  };
}

function wrapSegments(
  text: string,
  words: readonly FrameWord[],
  fontSize: number,
  maxWidth: number,
): readonly (readonly Segment[])[] {
  const parts = text.split(/(\s+)/u).filter((part) => part.length > 0);
  const rows: Segment[][] = [];
  let wordIndex = 0;
  const pushRow = (rowText: string): void => {
    const result = lineSegments(rowText, words, wordIndex);
    rows.push([...result.segments]);
    wordIndex = result.nextWordIndex;
  };
  let current = "";
  for (const part of parts) {
    const candidate = `${current}${part}`;
    if (current && segmentWidth({ text: candidate, active: false }, fontSize) > maxWidth) {
      pushRow(current.trimEnd());
      current = part.trimStart();
    } else {
      current = candidate;
    }
    if (segmentWidth({ text: current, active: false }, fontSize) > maxWidth) {
      for (const chunk of splitLongText(current, fontSize, maxWidth)) {
        pushRow(chunk);
      }
      current = "";
    }
  }
  if (current.trim()) pushRow(current.trim());
  return rows.length > 0 ? rows : [[{ text, active: false }]];
}

function lineX(theme: VisualTheme, safeX: number, safeWidth: number, width: number): number {
  if (theme.textAlign === "left") return safeX;
  if (theme.textAlign === "right") return safeX + safeWidth - width;
  return safeX + (safeWidth - width) / 2;
}

export function layoutFrame(theme: VisualTheme, lyrics: FrameLyrics): FrameLayout {
  const preset = getRenderPreset(theme.preset);
  const safe = preset.safeArea;
  const currentFont = fontSizeFor(preset, theme);
  const adjacentFont = Math.round(currentFont * 0.58);
  const entries = [
    ...(theme.showAdjacentLines && lyrics.previous
      ? [{ frame: lyrics.previous, fontSize: adjacentFont }]
      : []),
    ...(lyrics.current ? [{ frame: lyrics.current, fontSize: currentFont }] : []),
    ...(theme.showAdjacentLines && lyrics.next
      ? [{ frame: lyrics.next, fontSize: adjacentFont }]
      : []),
  ];
  const laidOut: TextLineLayout[] = [];
  for (const entry of entries) {
    const wrapped = wrapSegments(entry.frame.text, entry.frame.words, entry.fontSize, safe.width);
    for (const row of wrapped) {
      const width = row.reduce((sum, segment) => sum + segmentWidth(segment, entry.fontSize), 0);
      laidOut.push({
        role: entry.frame.role,
        x: lineX(theme, safe.x, safe.width, width),
        y: 0,
        width,
        height: Math.round(entry.fontSize * 1.22),
        fontSize: entry.fontSize,
        text: row.map((segment) => segment.text).join(""),
        runs: row.map((segment, index) => ({
          text: segment.text,
          x: row.slice(0, index).reduce((sum, item) => sum + segmentWidth(item, entry.fontSize), 0),
          y: 0,
          width: segmentWidth(segment, entry.fontSize),
          active: segment.active,
        })),
      });
    }
  }
  const totalHeight = laidOut.reduce((sum, line) => sum + line.height, 0);
  const top = Math.max(
    safe.y,
    Math.min(
      safe.y + safe.height - totalHeight,
      preset.height * theme.verticalPosition - totalHeight / 2,
    ),
  );
  let y = top;
  return {
    preset,
    safeArea: safe,
    lines: laidOut.map((line) => {
      const placed = {
        ...line,
        y,
        runs: line.runs.map((run) => ({ ...run, x: line.x + run.x, y })),
      };
      y += line.height;
      return placed;
    }),
  };
}
