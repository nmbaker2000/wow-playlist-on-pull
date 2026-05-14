import type { PlaylistInput, PlaylistProvider, ProviderPlaylistOption } from "./types";
import { YouTubePlaylistLibrary } from "./youtubeLibrary";

export class YouTubePlaylistProvider implements PlaylistProvider {
  readonly id = "youtube";
  readonly label = "YouTube";
  readonly supportsShuffle = true;
  readonly accountAction = {
    id: "youtube-login",
    label: "YouTube Premium",
    signedInLabel: "Manage",
    signedOutLabel: "Sign in"
  } as const;

  constructor(private readonly playlistLibrary?: YouTubePlaylistLibrary) {}

  buildPlaybackUrl(input: PlaylistInput): string {
    const playlist =
      input.source === "account" && input.playlistId
        ? { playlistId: validateYouTubePlaylistId(input.playlistId), videoId: null }
        : parseYouTubePlaylistInput(input.playlistUrlOrId);
    const url = playlist.videoId && (!playlist.playlistId || !input.shuffleEnabled)
      ? new URL("https://www.youtube.com/watch")
      : new URL("https://www.youtube.com/playlist");

    if (playlist.videoId && (!playlist.playlistId || !input.shuffleEnabled)) {
      url.searchParams.set("v", playlist.videoId);
    }

    if (playlist.playlistId) {
      url.searchParams.set("list", playlist.playlistId);
    }
    url.searchParams.set("autoplay", "1");
    if (playlist.playlistId && input.shuffleEnabled) {
      url.searchParams.set("enablejsapi", "1");
    }
    return url.toString();
  }

  async listAccountPlaylists(): Promise<ProviderPlaylistOption[]> {
    if (!this.playlistLibrary) {
      throw new Error("YouTube playlist library is not configured.");
    }

    return this.playlistLibrary.listAccountPlaylists();
  }
}

export function extractYouTubePlaylistId(value: string): string {
  const playlistId = parseYouTubePlaylistInput(value).playlistId;
  if (!playlistId) {
    throw new Error("Enter a valid YouTube playlist URL or playlist ID.");
  }

  return playlistId;
}

export interface YouTubePlaylistParts {
  playlistId: string | null;
  videoId: string | null;
}

export function parseYouTubePlaylistInput(value: string): YouTubePlaylistParts {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error("A YouTube playlist URL or playlist ID is required.");
  }

  try {
    const url = new URL(trimmed);
    const list = url.searchParams.get("list");
    if (list) {
      return {
        playlistId: validateYouTubePlaylistId(list),
        videoId: validateOptionalYouTubeVideoId(extractYouTubeVideoId(url))
      };
    }

    const videoId = validateOptionalYouTubeVideoId(extractYouTubeVideoId(url));
    if (videoId) {
      return {
        playlistId: null,
        videoId
      };
    }

    throw new Error("Enter a valid YouTube playlist or video URL.");
  } catch {
    if (/^https?:\/\//i.test(trimmed)) {
      throw new Error("Enter a valid YouTube playlist or video URL.");
    }
  }

  return {
    playlistId: validateYouTubePlaylistId(trimmed),
    videoId: null
  };
}

function extractYouTubeVideoId(url: URL): string | null {
  const watchVideoId = url.searchParams.get("v");
  if (watchVideoId) {
    return watchVideoId;
  }

  const host = url.hostname.toLocaleLowerCase();
  const pathParts = url.pathname.split("/").filter(Boolean);
  if (host === "youtu.be") {
    return pathParts[0] ?? null;
  }

  if (pathParts[0]?.toLocaleLowerCase() === "embed" || pathParts[0]?.toLocaleLowerCase() === "shorts") {
    return pathParts[1] ?? null;
  }

  return null;
}

function validateYouTubePlaylistId(value: string): string {
  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]+$/.test(trimmed)) {
    throw new Error("Enter a valid YouTube playlist URL or playlist ID.");
  }

  return trimmed;
}

function validateOptionalYouTubeVideoId(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const trimmed = value.trim();
  if (!/^[A-Za-z0-9_-]{11}$/.test(trimmed)) {
    throw new Error("Enter a valid YouTube playlist URL or playlist ID.");
  }

  return trimmed;
}
