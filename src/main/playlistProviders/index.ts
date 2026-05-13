import { LocalMediaPlaylistProvider } from "./localMediaProvider";
import { YouTubePlaylistProvider } from "./youtubeProvider";
import { YouTubePlaylistLibrary } from "./youtubeLibrary";
import type { PlaylistProvider, PlaylistProviderId } from "./types";

export const youtubePlaylistLibrary = new YouTubePlaylistLibrary();
const providers: PlaylistProvider[] = [
  new YouTubePlaylistProvider(youtubePlaylistLibrary),
  new LocalMediaPlaylistProvider()
];

export function getPlaylistProvider(id: PlaylistProviderId): PlaylistProvider {
  const provider = providers.find((candidate) => candidate.id === id);
  if (!provider) {
    throw new Error(`Unknown playlist provider: ${id}`);
  }

  return provider;
}

export function listPlaylistProviders(): Array<Pick<PlaylistProvider, "id" | "label">> {
  return providers.map(({ id, label }) => ({ id, label }));
}

export function listPlaylistProviderAccountActions(): Array<
  Required<Pick<PlaylistProvider, "accountAction">>["accountAction"] & {
    providerId: PlaylistProviderId;
    providerLabel: string;
  }
> {
  return providers.flatMap((provider) =>
    provider.accountAction
      ? [
          {
            providerId: provider.id,
            providerLabel: provider.label,
            ...provider.accountAction
          }
        ]
      : []
  );
}

export type {
  PlaylistInput,
  LocalMediaSelection,
  PlaylistSelection,
  PlaylistSelectionSource,
  PlaylistProvider,
  PlaylistProviderAccountAction,
  PlaylistProviderAccountActionId,
  PlaylistProviderId,
  ProviderPlaylistOption
} from "./types";
export type { YouTubeLibraryState, YouTubeOAuthClientCredentials } from "./youtubeLibrary";
