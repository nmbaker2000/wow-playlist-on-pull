export interface PlaybackWebContents {
  executeJavaScript(script: string): Promise<unknown>;
}

export function createPlaybackVolumeScript(value: unknown): string {
  const volume = normalizePlaybackVolume(value);

  return `(() => {
    const volume = ${JSON.stringify(volume)};
    const localPlayer = window.localMediaPlayer;
    if (localPlayer && typeof localPlayer.setVolume === "function") {
      localPlayer.setVolume(volume);
    }
    document.querySelectorAll("video, audio").forEach((media) => {
      media.volume = volume;
    });
  })();`;
}

export async function applyPlaybackVolumeToWebContents(
  webContents: PlaybackWebContents,
  value: unknown
): Promise<void> {
  await webContents.executeJavaScript(createPlaybackVolumeScript(value)).catch(() => undefined);
}

export function normalizePlaybackVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0, value));
}
