import { contextBridge, ipcRenderer } from "electron";
import type { PlayerStatus } from "./playerLifecycle";
import type { PullEvent } from "./pullDetector";
import type { PlaylistProviderAccountActionId, PlaylistProviderId } from "./playlistProviders";
import type { LocalMediaSelection } from "./playlistProviders";
import type { ProviderPlaylistOption, YouTubeLibraryState } from "./playlistProviders";
import type { PlaylistRule, PlaylistRuleSettings } from "./playlistRules";
import type { CombatLogCandidate } from "./combatLogDiscovery";
import type { YouTubePrivacyStatus } from "./youtubeSessionPrivacy";

export interface RendererActivityEvent {
  message: string;
  timestamp: string;
}

export interface RendererState {
  settings: {
    logPath: string | null;
    theme: "dark" | "light";
    youtubeOAuthClientId: string;
    youtubeOAuthClientSecret: string;
    defaultPlaylist: PlaylistRuleSettings;
    playlistRules: PlaylistRule[];
    seenEncounters: RendererEncounterInfo[];
    preloadEnabled: boolean;
    playbackVolume: number;
  };
  providers: Array<{ id: PlaylistProviderId; label: string }>;
  providerAccounts: RendererProviderAccount[];
  isWatching: boolean;
  playerStatus: PlayerStatus;
}

export interface YouTubeAuthStatus {
  signedIn: boolean;
}

export interface RendererProviderAccount {
  providerId: PlaylistProviderId;
  providerLabel: string;
  actionId: PlaylistProviderAccountActionId;
  label: string;
  statusLabel: string;
  actionLabel: string;
  logoutLabel: string;
  canLogout: boolean;
  signedIn: boolean;
  libraryStatusLabel?: string;
  libraryConnected?: boolean;
  libraryCanDisconnect?: boolean;
  privacyStatus?: YouTubePrivacyStatus;
  privacyStatusLabel?: string;
}

export interface RendererEncounterInfo {
  encounterId: string;
  encounterName?: string;
  difficultyId?: number;
  groupSize?: number;
}

const api = {
  getState: (): Promise<RendererState> => ipcRenderer.invoke("app:get-state"),
  selectLog: (): Promise<string | null> => ipcRenderer.invoke("app:select-log"),
  selectLocalMedia: (
    mode: "files" | "folder",
    current: LocalMediaSelection
  ): Promise<LocalMediaSelection> => ipcRenderer.invoke("app:select-local-media", mode, current),
  setLogPath: (logPath: string): Promise<string | null> => ipcRenderer.invoke("app:set-log-path", logPath),
  discoverCombatLogs: (): Promise<CombatLogCandidate[]> =>
    ipcRenderer.invoke("app:discover-combat-logs"),
  saveSettings: (settings: {
    defaultPlaylist: PlaylistRuleSettings;
    playlistRules: PlaylistRule[];
    preloadEnabled: boolean;
  }): Promise<RendererState["settings"]> => ipcRenderer.invoke("app:save-settings", settings),
  setPlaybackVolume: (volume: number): Promise<number> => ipcRenderer.invoke("app:set-playback-volume", volume),
  setTheme: (theme: RendererState["settings"]["theme"]): Promise<RendererState["settings"]["theme"]> =>
    ipcRenderer.invoke("app:set-theme", theme),
  saveOAuthCredentials: (credentials: {
    youtubeOAuthClientId: string;
    youtubeOAuthClientSecret: string;
  }): Promise<{ youtubeOAuthClientId: string; youtubeOAuthClientSecret: string }> =>
    ipcRenderer.invoke("app:save-oauth-credentials", credentials),
  startWatching: (): Promise<{ isWatching: boolean }> => ipcRenderer.invoke("app:start-watching"),
  stopWatching: (): Promise<{ isWatching: boolean }> => ipcRenderer.invoke("app:stop-watching"),
  testPlaylist: (): Promise<void> => ipcRenderer.invoke("app:test-playlist"),
  preloadPlaylist: (): Promise<{ status: PlayerStatus }> => ipcRenderer.invoke("app:preload-playlist"),
  stopPlaylist: (): Promise<{ status: PlayerStatus }> => ipcRenderer.invoke("app:stop-playlist"),
  openYouTubeLogin: (): Promise<YouTubeAuthStatus> => ipcRenderer.invoke("app:open-youtube-login"),
  openProviderAccount: (actionId: PlaylistProviderAccountActionId): Promise<RendererProviderAccount[]> =>
    ipcRenderer.invoke("app:open-provider-account", actionId),
  clearProviderAccount: (providerId: PlaylistProviderId): Promise<RendererProviderAccount[]> =>
    ipcRenderer.invoke("app:clear-provider-account", providerId),
  connectProviderLibrary: (providerId: PlaylistProviderId): Promise<YouTubeLibraryState> =>
    ipcRenderer.invoke("app:connect-provider-library", providerId),
  listProviderPlaylists: (providerId: PlaylistProviderId): Promise<ProviderPlaylistOption[]> =>
    ipcRenderer.invoke("app:list-provider-playlists", providerId),
  disconnectProviderLibrary: (providerId: PlaylistProviderId): Promise<YouTubeLibraryState> =>
    ipcRenderer.invoke("app:disconnect-provider-library", providerId),
  onPullEvent: (callback: (event: PullEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, pullEvent: PullEvent) => callback(pullEvent);
    ipcRenderer.on("app:pull-event", listener);
    return () => ipcRenderer.off("app:pull-event", listener);
  },
  onWatchError: (callback: (message: string) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, message: string) => callback(message);
    ipcRenderer.on("app:watch-error", listener);
    return () => ipcRenderer.off("app:watch-error", listener);
  },
  onActivityEvent: (callback: (event: RendererActivityEvent) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, activityEvent: RendererActivityEvent) =>
      callback(activityEvent);
    ipcRenderer.on("app:activity-event", listener);
    return () => ipcRenderer.off("app:activity-event", listener);
  },
  onProviderAccounts: (callback: (accounts: RendererProviderAccount[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, accounts: RendererProviderAccount[]) =>
      callback(accounts);
    ipcRenderer.on("app:provider-accounts", listener);
    return () => ipcRenderer.off("app:provider-accounts", listener);
  },
  onSeenEncounters: (callback: (encounters: RendererEncounterInfo[]) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, encounters: RendererEncounterInfo[]) =>
      callback(encounters);
    ipcRenderer.on("app:seen-encounters", listener);
    return () => ipcRenderer.off("app:seen-encounters", listener);
  }
};

contextBridge.exposeInMainWorld("wowPullPlaylist", api);

export type WowPullPlaylistApi = typeof api;
