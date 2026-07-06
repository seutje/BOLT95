export const AUDIO_SAMPLE_RATE = 16_000;

export interface WaveformData {
  readonly durationMs: number;
  readonly samplesPerSecond: number;
  readonly min: Float32Array;
  readonly max: Float32Array;
  readonly rms: Float32Array;
}

export type ProcessingRisk = "low" | "moderate" | "high";

export interface AudioAnalysis {
  readonly durationMs: number;
  readonly sampleRate: typeof AUDIO_SAMPLE_RATE;
  readonly sampleCount: number;
  readonly fingerprint: string;
  readonly waveform: WaveformData;
  readonly pcm: Float32Array;
}

export interface AudioImportResult extends AudioAnalysis {
  readonly file: File;
  readonly objectUrl: string;
  readonly format: "MP3";
  readonly risk: ProcessingRisk;
  readonly riskReasons: readonly string[];
}
