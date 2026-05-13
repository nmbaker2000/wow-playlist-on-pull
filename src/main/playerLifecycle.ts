import type { PlaylistProviderId } from "./playlistProviders/types";

export type PlayerStatus = "idle" | "preloading" | "ready" | "playing" | "stopped" | "error";
export type PlaybackRoute = "browser-window" | "local-media";

export interface PlaybackPlanInput {
  preloadEnabled: boolean;
  playerStatus: PlayerStatus;
  currentPlaybackUrl: string | null;
  targetPlaybackUrl: string;
}

export interface PlaybackPlan {
  usePreloadedPlayer: boolean;
  shouldLoadTargetUrl: boolean;
}

export function choosePlaybackPlan(input: PlaybackPlanInput): PlaybackPlan {
  const canUsePreload =
    input.preloadEnabled &&
    input.playerStatus === "ready" &&
    input.currentPlaybackUrl === input.targetPlaybackUrl;

  return {
    usePreloadedPlayer: canUsePreload,
    shouldLoadTargetUrl: !canUsePreload
  };
}

export function getPlaybackRoute(providerId: PlaylistProviderId): PlaybackRoute {
  if (providerId === "local") {
    return "local-media";
  }

  return "browser-window";
}
