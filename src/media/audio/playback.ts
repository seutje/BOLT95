export interface PlaybackClockSnapshot {
  readonly currentTimeMs: number;
  readonly playing: boolean;
}

export class AudioPlaybackClock {
  private readonly audio: HTMLAudioElement;

  constructor(sourceUrl: string) {
    this.audio = new Audio(sourceUrl);
    this.audio.preload = "metadata";
  }

  get element(): HTMLAudioElement {
    return this.audio;
  }

  get snapshot(): PlaybackClockSnapshot {
    return {
      currentTimeMs: Math.round(this.audio.currentTime * 1000),
      playing: !this.audio.paused,
    };
  }

  async play(): Promise<void> {
    await this.audio.play();
  }

  pause(): void {
    this.audio.pause();
  }

  seek(ms: number): void {
    this.audio.currentTime = Math.max(0, ms) / 1000;
  }

  dispose(): void {
    this.audio.pause();
    this.audio.removeAttribute("src");
    this.audio.load();
  }
}
