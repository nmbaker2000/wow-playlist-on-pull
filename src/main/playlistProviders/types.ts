export type PlaylistProviderId = "youtube" | "local";
export type PlaylistProviderAccountActionId = "youtube-login";

export type PlaylistSelectionSource = "manual" | "account" | "local";

export interface LocalMediaSelection {
  filePaths: string[];
  folderPaths: string[];
}

export interface PlaylistSelection {
  providerId: PlaylistProviderId;
  playlistId?: string;
  playlistTitle?: string;
  playlistUrlOrId: string;
  source: PlaylistSelectionSource;
  shuffleEnabled: boolean;
  localMedia?: LocalMediaSelection;
}

export interface PlaylistInput {
  playlistUrlOrId: string;
  playlistId?: string;
  source?: PlaylistSelectionSource;
  shuffleEnabled?: boolean;
  localMedia?: LocalMediaSelection;
}

export interface ProviderPlaylistOption {
  providerId: PlaylistProviderId;
  playlistId: string;
  playlistTitle: string;
  thumbnailUrl?: string;
  privacyStatus?: string;
  videoCount?: number;
}

export interface PlaylistProviderAccountAction {
  readonly id: PlaylistProviderAccountActionId;
  readonly label: string;
  readonly signedInLabel: string;
  readonly signedOutLabel: string;
}

export interface PlaylistProvider {
  readonly id: PlaylistProviderId;
  readonly label: string;
  readonly accountAction?: PlaylistProviderAccountAction;
  readonly supportsShuffle?: boolean;
  buildPlaybackUrl(input: PlaylistInput): string;
  listAccountPlaylists?(): Promise<ProviderPlaylistOption[]>;
}
