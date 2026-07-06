import { AUDIO_SAMPLE_RATE } from "./types";

const KERNEL_RADIUS = 16;

function sinc(value: number): number {
  if (Math.abs(value) < 1e-8) return 1;
  const angle = Math.PI * value;
  return Math.sin(angle) / angle;
}

function blackman(distance: number): number {
  const normalized = (distance + KERNEL_RADIUS) / (2 * KERNEL_RADIUS);
  return (
    0.42 - 0.5 * Math.cos(2 * Math.PI * normalized) + 0.08 * Math.cos(4 * Math.PI * normalized)
  );
}

export function downmixChannels(channels: readonly Float32Array[]): Float32Array {
  if (channels.length === 0) return new Float32Array();
  const length = Math.min(...channels.map((channel) => channel.length));
  const mono = new Float32Array(length);
  for (let sample = 0; sample < length; sample += 1) {
    let value = 0;
    for (const channel of channels) value += channel[sample] ?? 0;
    mono[sample] = Math.max(-1, Math.min(1, value / channels.length));
  }
  return mono;
}

export function resampleWindowedSinc(
  input: Float32Array,
  sourceRate: number,
  targetRate = AUDIO_SAMPLE_RATE,
): Float32Array {
  if (sourceRate <= 0 || targetRate <= 0) throw new RangeError("Sample rates must be positive");
  if (input.length === 0) return new Float32Array();
  if (sourceRate === targetRate) return input.slice();

  const outputLength = Math.max(1, Math.round((input.length * targetRate) / sourceRate));
  const output = new Float32Array(outputLength);
  const ratio = sourceRate / targetRate;
  const cutoff = Math.min(1, targetRate / sourceRate);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const sourcePosition = outputIndex * ratio;
    const center = Math.floor(sourcePosition);
    let weighted = 0;
    let weightSum = 0;
    for (let offset = -KERNEL_RADIUS + 1; offset <= KERNEL_RADIUS; offset += 1) {
      const sourceIndex = center + offset;
      if (sourceIndex < 0 || sourceIndex >= input.length) continue;
      const distance = sourcePosition - sourceIndex;
      const weight = cutoff * sinc(distance * cutoff) * blackman(distance);
      weighted += (input[sourceIndex] ?? 0) * weight;
      weightSum += weight;
    }
    output[outputIndex] = Math.max(-1, Math.min(1, weightSum === 0 ? 0 : weighted / weightSum));
  }
  return output;
}
