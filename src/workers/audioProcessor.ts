import { AppError } from "../app/errors/AppError";
import { fingerprintBytes } from "../media/audio/fingerprint";
import { downmixChannels, resampleWindowedSinc } from "../media/audio/resample";
import { AUDIO_SAMPLE_RATE } from "../media/audio/types";
import { computeWaveform } from "../media/audio/waveform";
import type { AudioCompleteResponse, AudioProcessRequest } from "./protocol";

function transferableBuffer(array: Float32Array): ArrayBuffer {
  return array.buffer as ArrayBuffer;
}

export async function processAudioRequest(
  request: AudioProcessRequest,
  progress: (value: number, message: string) => void = () => undefined,
): Promise<AudioCompleteResponse> {
  progress(0.1, "Downmixing channels…");
  const mono = downmixChannels(request.channels.map((channel) => new Float32Array(channel)));
  progress(0.3, "Resampling to 16 kHz…");
  const pcm = resampleWindowedSinc(mono, request.sourceRate, AUDIO_SAMPLE_RATE);
  if (pcm.length === 0 || pcm.some((sample) => !Number.isFinite(sample))) {
    throw new AppError("AUDIO_DECODE_FAILED", "Decoded audio contains no usable samples.", {
      technicalDetail: "empty or non-finite PCM output",
      recoveryAction: "Choose another MP3 or re-encode this file and try again.",
    });
  }
  progress(0.72, "Computing waveform and fingerprint…");
  const [fingerprint, waveform] = await Promise.all([
    fingerprintBytes(request.sourceBytes),
    Promise.resolve(computeWaveform(pcm, AUDIO_SAMPLE_RATE)),
  ]);
  progress(1, "Audio analysis complete.");
  return {
    type: "audio/complete",
    jobId: request.jobId,
    pcm: transferableBuffer(pcm),
    fingerprint,
    waveform: {
      durationMs: waveform.durationMs,
      samplesPerSecond: waveform.samplesPerSecond,
      min: transferableBuffer(waveform.min),
      max: transferableBuffer(waveform.max),
      rms: transferableBuffer(waveform.rms),
    },
  };
}
