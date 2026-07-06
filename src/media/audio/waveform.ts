import type { WaveformData } from "./types";

export function computeWaveform(
  pcm: Float32Array,
  sampleRate: number,
  samplesPerSecond = 20,
): WaveformData {
  const durationMs = Math.round((pcm.length / sampleRate) * 1000);
  const bucketCount = Math.max(1, Math.ceil((durationMs / 1000) * samplesPerSecond));
  const min = new Float32Array(bucketCount);
  const max = new Float32Array(bucketCount);
  const rms = new Float32Array(bucketCount);

  for (let bucket = 0; bucket < bucketCount; bucket += 1) {
    const start = Math.floor((bucket * pcm.length) / bucketCount);
    const end = Math.max(start + 1, Math.floor(((bucket + 1) * pcm.length) / bucketCount));
    let low = 1;
    let high = -1;
    let squares = 0;
    let count = 0;
    for (let index = start; index < Math.min(end, pcm.length); index += 1) {
      const value = pcm[index] ?? 0;
      low = Math.min(low, value);
      high = Math.max(high, value);
      squares += value * value;
      count += 1;
    }
    min[bucket] = count ? low : 0;
    max[bucket] = count ? high : 0;
    rms[bucket] = count ? Math.sqrt(squares / count) : 0;
  }
  return { durationMs, samplesPerSecond, min, max, rms };
}
