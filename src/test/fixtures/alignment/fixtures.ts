import { parseLyrics } from "../../../domain/lyrics/parser";
import { createCanonicalLyrics } from "../../../domain/lyrics/canonical";
import type { TranscriptResult } from "../../../domain/alignment/engine";

export interface AlignmentFixture {
  readonly id: string;
  readonly title: string;
  readonly lyricsText: string;
  readonly transcript: TranscriptResult;
}

function transcript(durationMs: number, words: readonly string[]): TranscriptResult {
  return {
    schemaVersion: 1,
    durationMs,
    words: words.map((word, index) => ({
      id: `word-${index + 1}`,
      text: word,
      startMs: 500 + index * 430,
      endMs: 790 + index * 430,
      confidence: 0.94,
    })),
  };
}

export const alignmentFixtures: readonly AlignmentFixture[] = [
  {
    id: "exact",
    title: "Exact lyric timing",
    lyricsText: "[Verse 1]\nHello world\nThis is BOLT95\n",
    transcript: transcript(8_000, ["hello", "world", "this", "is", "bolt95"]),
  },
  {
    id: "substitutions",
    title: "Substitutions and missing words",
    lyricsText: "Color in the night\nA little light\n",
    transcript: transcript(9_000, ["colour", "in", "night", "a", "tiny", "light"]),
  },
  {
    id: "fillers",
    title: "Extra vocal fillers",
    lyricsText: "We keep moving\nThrough the static\n",
    transcript: transcript(9_000, [
      "um",
      "we",
      "keep",
      "moving",
      "yeah",
      "through",
      "the",
      "static",
    ]),
  },
  {
    id: "repeated-chorus",
    title: "Repeated chorus",
    lyricsText:
      "[Chorus]\nStay with me\nStay with me\n\n[Bridge]\nRun to the light\nStay with me\n",
    transcript: transcript(13_000, [
      "stay",
      "with",
      "me",
      "stay",
      "with",
      "me",
      "run",
      "to",
      "the",
      "light",
      "stay",
      "with",
      "me",
    ]),
  },
  {
    id: "instrumental-gap",
    title: "Instrumental gap",
    lyricsText: "First line\n[Instrumental]\nSecond line\n",
    transcript: transcript(12_000, ["first", "line", "second", "line"]),
  },
  {
    id: "contractions-numbers-accents",
    title: "Contractions, numbers, accents",
    lyricsText: "Don’t stop at 2\nCafé déjà vu\n",
    transcript: transcript(10_000, ["do", "not", "stop", "at", "two", "cafe", "deja", "vu"]),
  },
  {
    id: "non-english",
    title: "Non-English accents",
    lyricsText: "Niño canta corazón\n",
    transcript: transcript(7_000, ["nino", "canta", "corazon"]),
  },
  {
    id: "silence",
    title: "Silence with supplied lyrics",
    lyricsText: "No voice here\nOnly lyrics\n",
    transcript: { schemaVersion: 1, durationMs: 6_000, words: [] },
  },
  {
    id: "wrong-song",
    title: "Wrong-song lyrics",
    lyricsText: "Moon above the river\nSilver shadows fall\n",
    transcript: transcript(8_000, ["engine", "noise", "countdown", "launch", "signal"]),
  },
];

export function canonicalFixture(id: string) {
  const fixture = alignmentFixtures.find((candidate) => candidate.id === id);
  if (!fixture) throw new Error(`Unknown alignment fixture: ${id}`);
  return createCanonicalLyrics(parseLyrics(fixture.lyricsText, "txt"));
}
