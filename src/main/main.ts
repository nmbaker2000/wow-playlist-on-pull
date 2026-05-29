import { app, BrowserWindow, dialog, ipcMain } from "electron";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { LocalMediaSelection } from "./playlistProviders";
import { getCombatLogDiscoveryProvider } from "./combatLogDiscovery";
import { CombatLogTailer } from "./combatLogTailer";
import { LocalMediaTrack, normalizeLocalMediaSelection, resolveLocalMediaTracks } from "./localMediaResolver";
import { choosePlaybackPlan, getPlaybackRoute, PlayerStatus } from "./playerLifecycle";
import {
  createDefaultPlaylistRule,
  migratePlaylistRuleSettings,
  normalizePlaylistSelection,
  PlaylistRule,
  PlaylistRuleSettings,
  selectPlaylistRule
} from "./playlistRules";
import { PullDetector, PullEvent } from "./pullDetector";
import { applyPlaybackVolumeToWebContents, normalizePlaybackVolume } from "./playerVolume";
import { appId, appName } from "./appIdentity";
import {
  getPlaylistProvider,
  listPlaylistProviderAccountActions,
  listPlaylistProviders,
  PlaylistProviderAccountActionId,
  PlaylistProviderId,
  YouTubeOAuthClientCredentials,
  youtubePlaylistLibrary
} from "./playlistProviders";
import {
  AppSettings,
  createDefaultSettings,
  EncounterInfo,
  loadSettings,
  saveSettingsToDisk
} from "./settingsStore";
import {
  attachYouTubeWindowPrivacy,
  clearYouTubeSessionData,
  configureYouTubeSessionPrivacy,
  getYouTubeSession,
  getYouTubePrivacyStatus,
  YouTubePrivacyStatus,
  YOUTUBE_SESSION_PARTITION
} from "./youtubeSessionPrivacy";

interface AppActivityEvent {
  message: string;
  timestamp: string;
}

interface YouTubeAuthStatus {
  signedIn: boolean;
}

interface ProviderAccountState {
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

class PlayerLoadError extends Error {
  constructor(
    message: string,
    readonly code?: string
  ) {
    super(message);
    this.name = "PlayerLoadError";
  }
}

let mainWindow: BrowserWindow | null = null;
let playerWindow: BrowserWindow | null = null;
let playerWindowProviderId: PlaylistProviderId | null = null;
let youtubeLoginWindow: BrowserWindow | null = null;
let tailer: CombatLogTailer | null = null;
let detector = new PullDetector();
let playerStatus: PlayerStatus = "idle";
let currentPlaybackUrl: string | null = null;
let preloadToken = 0;
let youtubePrivacyReady: Promise<void> | null = null;

const PLAYER_LOAD_TIMEOUT_MS = 12_000;
const PLAYER_SETTLE_MS = 2_500;
const YOUTUBE_LOGIN_URL = "https://www.youtube.com/account";
const YOUTUBE_EMBED_REFERRER = "https://www.youtube.com/";

let settings: AppSettings = createDefaultSettings();

const rendererPath = path.join(__dirname, "..", "renderer", "index.html");
const localPlayerPath = path.join(__dirname, "..", "renderer", "localPlayer.html");
const appIconPath = path.join(__dirname, "..", "..", "build", process.platform === "win32" ? "icon.ico" : "icon.png");

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.setName(appName);
if (process.platform === "win32") {
  app.setAppUserModelId(appId);
}

app.whenReady().then(async () => {
  settings = await loadSettings();
  youtubePlaylistLibrary.setClientCredentialsProvider(getYouTubeOAuthClientCredentials);
  youtubePrivacyReady = configureYouTubeSessionPrivacy();
  void youtubePrivacyReady.then(() => {
    void publishProviderAccountStatus();
  });
  createMainWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on("window-all-closed", () => {
  stopWatchingLog();

  if (process.platform !== "darwin") {
    app.quit();
  }
});

function createMainWindow(): void {
  mainWindow = new BrowserWindow({
    width: 980,
    height: 700,
    minWidth: 920,
    minHeight: 620,
    title: appName,
    icon: appIconPath,
    backgroundColor: settings.theme === "light" ? "#f6f2ea" : "#101820",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  void mainWindow.loadFile(rendererPath);
  mainWindow.on("closed", () => {
    mainWindow = null;
    stopWatchingLog();
    void stopConfiguredPlaylist({ rePreload: false, closeWindow: true });
  });
}

ipcMain.handle("app:get-state", async () => ({
  settings,
  providers: listPlaylistProviders(),
  providerAccounts: await getProviderAccountStates(),
  isWatching: tailer !== null,
  playerStatus
}));

ipcMain.handle("app:select-log", async () => {
  const options: Electron.OpenDialogOptions = {
    title: "Select WoWCombatLog.txt",
    filters: [{ name: "Combat logs", extensions: ["txt", "log"] }],
    properties: ["openFile"]
  };
  const result = mainWindow
    ? await dialog.showOpenDialog(mainWindow, options)
    : await dialog.showOpenDialog(options);

  if (result.canceled || result.filePaths.length === 0) {
    return settings.logPath;
  }

  settings.logPath = result.filePaths[0];
  await persistSettings();
  return settings.logPath;
});

ipcMain.handle(
  "app:select-local-media",
  async (_event, mode: "files" | "folder", current: LocalMediaSelection): Promise<LocalMediaSelection> => {
    const options: Electron.OpenDialogOptions = mode === "files"
      ? {
          title: "Select local audio files",
          filters: [{ name: "Audio files", extensions: ["mp3", "wav", "flac", "m4a", "aac", "ogg", "oga", "opus", "webm"] }],
          properties: ["openFile", "multiSelections"]
        }
      : {
          title: "Select local audio folder",
          properties: ["openDirectory", "multiSelections"]
        };
    const result = mainWindow
      ? await dialog.showOpenDialog(mainWindow, options)
      : await dialog.showOpenDialog(options);

    if (result.canceled || result.filePaths.length === 0) {
      return normalizeLocalMediaSelection(current);
    }

    return normalizeLocalMediaSelection({
      filePaths: mode === "files" ? [...current.filePaths, ...result.filePaths] : current.filePaths,
      folderPaths: mode === "folder" ? [...current.folderPaths, ...result.filePaths] : current.folderPaths
    });
  }
);

ipcMain.handle("app:set-log-path", async (_event, logPath: string) => {
  settings.logPath = logPath;
  await persistSettings();
  sendActivity(`Selected combat log: ${path.basename(logPath)}`);
  return settings.logPath;
});

ipcMain.handle("app:discover-combat-logs", async () => {
  const provider = getCombatLogDiscoveryProvider();
  return provider.discover();
});

ipcMain.handle(
  "app:save-settings",
  async (
    _event,
    nextSettings: Pick<AppSettings, "defaultPlaylist" | "playlistRules" | "preloadEnabled">
  ) => {
    validatePlaylistSettings(nextSettings.defaultPlaylist, nextSettings.playlistRules);
    settings.defaultPlaylist = normalizePlaylistSettings(nextSettings.defaultPlaylist);
    settings.playlistRules = nextSettings.playlistRules.map(normalizePlaylistRule);
    settings.preloadEnabled = nextSettings.preloadEnabled;
    await persistSettings();
    return settings;
  }
);

ipcMain.handle("app:set-playback-volume", async (_event, volume: number) => {
  settings.playbackVolume = normalizePlaybackVolume(volume);
  await persistSettings();
  await applyPlaybackVolumeToPlayerWindow(settings.playbackVolume);
  return settings.playbackVolume;
});

ipcMain.handle("app:set-theme", async (_event, theme: AppSettings["theme"]) => {
  if (theme !== "dark" && theme !== "light") {
    throw new Error(`Unknown theme: ${theme}`);
  }

  settings.theme = theme;
  await persistSettings();
  return settings.theme;
});

ipcMain.handle("app:save-oauth-credentials", async (_event, credentials: {
  youtubeOAuthClientId: string;
  youtubeOAuthClientSecret: string;
}) => {
  settings.youtubeOAuthClientId = credentials.youtubeOAuthClientId.trim();
  settings.youtubeOAuthClientSecret = credentials.youtubeOAuthClientSecret.trim();
  youtubePlaylistLibrary.setClientCredentialsProvider(getYouTubeOAuthClientCredentials);
  await persistSettings();
  return {
    youtubeOAuthClientId: settings.youtubeOAuthClientId,
    youtubeOAuthClientSecret: settings.youtubeOAuthClientSecret
  };
});

ipcMain.handle("app:start-watching", async () => {
  if (!settings.logPath) {
    throw new Error("Select a combat log before starting.");
  }

  if (!hasConfiguredPlaylistSelection(settings.defaultPlaylist.selection)) {
    throw new Error("Add a playlist URL or ID before starting.");
  }

  stopWatchingLog();
  detector = new PullDetector();
  tailer = new CombatLogTailer(settings.logPath);

  tailer.on("line", (line) => {
    const pullEvent = detector.acceptLine(line);
    if (!pullEvent) {
      return;
    }

    mainWindow?.webContents.send("app:pull-event", pullEvent);

    if (pullEvent.type === "pull-started") {
      addSeenEncounter(pullEvent);
      sendPullActivity(pullEvent);
      void startConfiguredPlaylist(pullEvent).catch((error) => {
        sendPlayerError(error);
      });
    } else {
      sendPullActivity(pullEvent);
      void stopConfiguredPlaylist({
        rePreload: settings.preloadEnabled && tailer !== null,
        closeWindow: false
      });
      sendActivity("Playlist stopped");
    }
  });

  tailer.on("error", (error) => {
    sendWatcherError(error.message);
  });

  await tailer.start();
  sendActivity("Watching combat log");
  if (settings.preloadEnabled) {
    void preloadConfiguredPlaylist();
  }
  return { isWatching: true };
});

ipcMain.handle("app:stop-watching", async () => {
  stopWatchingLog();
  await stopConfiguredPlaylist({ rePreload: false, closeWindow: false });
  sendActivity("Stopped watching");
  return { isWatching: false };
});

ipcMain.handle("app:test-playlist", async () => {
  await playConfiguredPlaylist();
});

ipcMain.handle("app:preload-playlist", async () => {
  await preloadConfiguredPlaylist();
  return { status: playerStatus };
});

ipcMain.handle("app:stop-playlist", async () => {
  await stopConfiguredPlaylist({ rePreload: false, closeWindow: false });
  return { status: playerStatus };
});

ipcMain.handle("app:open-youtube-login", async () => {
  openYouTubeLoginWindow();
  sendActivity("Opened YouTube sign-in");
  return getYouTubeAuthStatus();
});

ipcMain.handle("app:open-provider-account", async (_event, actionId: PlaylistProviderAccountActionId) => {
  if (actionId === "youtube-login") {
    openYouTubeLoginWindow();
    sendActivity("Opened YouTube sign-in");
    return getProviderAccountStates();
  }

  throw new Error(`Unknown provider account action: ${actionId}`);
});

ipcMain.handle("app:clear-provider-account", async (_event, providerId: PlaylistProviderId) => {
  if (providerId === "youtube") {
    await clearYouTubeAccountSession();
    sendActivity("YouTube account signed out");
    return getProviderAccountStates();
  }

  throw new Error(`Unknown provider account: ${providerId}`);
});

ipcMain.handle("app:connect-provider-library", async (_event, providerId: PlaylistProviderId) => {
  if (providerId !== "youtube") {
    throw new Error(`${getPlaylistProvider(providerId).label} does not support playlist library browsing yet.`);
  }

  const state = await youtubePlaylistLibrary.connect(mainWindow);
  sendActivity("YouTube playlist library connected");
  mainWindow?.webContents.send("app:provider-accounts", await getProviderAccountStates());
  return state;
});

ipcMain.handle("app:list-provider-playlists", async (_event, providerId: PlaylistProviderId) => {
  const provider = getPlaylistProvider(providerId);
  if (!provider.listAccountPlaylists) {
    throw new Error(`${provider.label} does not support playlist library browsing.`);
  }

  return provider.listAccountPlaylists();
});

ipcMain.handle("app:disconnect-provider-library", async (_event, providerId: PlaylistProviderId) => {
  if (providerId !== "youtube") {
    throw new Error(`${getPlaylistProvider(providerId).label} does not support playlist library browsing yet.`);
  }

  const state = await youtubePlaylistLibrary.disconnect();
  sendActivity("YouTube playlist library disconnected");
  mainWindow?.webContents.send("app:provider-accounts", await getProviderAccountStates());
  return state;
});

function stopWatchingLog(): void {
  tailer?.stop();
  tailer = null;
}

async function preloadConfiguredPlaylist(): Promise<void> {
  if (!hasConfiguredPlaylistSelection(settings.defaultPlaylist.selection)) {
    return;
  }

  const token = ++preloadToken;
  const selection = getPlaybackSelection();
  const playbackUrl = buildPlaybackUrl();
  if (getPlaybackRoute(selection.providerId) === "local-media") {
    const tracks = await resolveLocalMediaTracks(selection.localMedia ?? { filePaths: [], folderPaths: [] });
    const window = ensurePlayerWindow({ show: false, providerId: selection.providerId });

    if (currentPlaybackUrl === playbackUrl && playerStatus === "ready") {
      return;
    }

    try {
      playerStatus = "preloading";
      currentPlaybackUrl = playbackUrl;
      sendActivity("Preloading local media");
      window.webContents.setAudioMuted(true);
      window.hide();
      await loadLocalPlayer(window, tracks, selection.shuffleEnabled, true, settings.playbackVolume);
      playerStatus = "ready";
      sendActivity("Local media ready");
    } catch (error) {
      if (token !== preloadToken) {
        return;
      }

      playerStatus = "error";
      sendPlayerError(error);
    }
    return;
  }

  const window = ensurePlayerWindow({ show: false, providerId: selection.providerId });

  if (currentPlaybackUrl === playbackUrl && playerStatus === "ready") {
    return;
  }

  try {
    await waitForProviderPrivacy(selection.providerId);
    playerStatus = "preloading";
    currentPlaybackUrl = playbackUrl;
    sendActivity("Preloading playlist");
    window.webContents.setAudioMuted(true);
    window.hide();
    await loadPlayerUrl(window, playbackUrl);
    await startYouTubePlaylistPageIfNeeded(window, playbackUrl, selection.shuffleEnabled);
    await settlePlayerWindow();
    await setupShuffleIfEnabled(window, selection);

    if (token !== preloadToken || window.isDestroyed()) {
      return;
    }

    await pausePlayerWindow(window);
    playerStatus = "ready";
    sendActivity("Playlist ready");
  } catch (error) {
    if (token !== preloadToken) {
      return;
    }

    playerStatus = "error";
    sendPlayerError(error);
  }
}

async function startConfiguredPlaylist(pullEvent: PullEvent): Promise<void> {
  const selection = getPlaybackSelection(pullEvent);
  const playbackUrl = buildPlaybackUrl(pullEvent);
  const plan = choosePlaybackPlan({
    preloadEnabled: settings.preloadEnabled,
    playerStatus,
    currentPlaybackUrl,
    targetPlaybackUrl: playbackUrl
  });

  if (plan.usePreloadedPlayer) {
    const window = ensurePlayerWindow({ show: true, providerId: selection.providerId });
    playerStatus = "playing";
    window.webContents.setAudioMuted(false);
    await applyPlaybackVolumeToPlayerWindow(settings.playbackVolume, window);
    showPlayerWindow(window);
    if (getPlaybackRoute(selection.providerId) === "local-media") {
      await playLocalPlayerWindow(window);
    } else {
      await setupShuffleIfEnabled(window, selection);
      await playPlayerWindow(window);
    }
    sendActivity("Playlist started");
    return;
  }

  await playConfiguredPlaylist(pullEvent);
}

async function playConfiguredPlaylist(pullEvent?: PullEvent): Promise<void> {
  ++preloadToken;
  const selection = getPlaybackSelection(pullEvent);
  const playbackUrl = buildPlaybackUrl(pullEvent);
  const window = ensurePlayerWindow({ show: true, providerId: selection.providerId });

  if (getPlaybackRoute(selection.providerId) === "local-media") {
    const tracks = await resolveLocalMediaTracks(selection.localMedia ?? { filePaths: [], folderPaths: [] });
    currentPlaybackUrl = playbackUrl;
    playerStatus = "playing";
    window.webContents.setAudioMuted(false);
    await loadLocalPlayer(window, tracks, selection.shuffleEnabled, false, settings.playbackVolume);
    showPlayerWindow(window);
    sendActivity(selection.shuffleEnabled ? "Local media started with shuffle" : "Local media started");
    return;
  }

  await waitForProviderPrivacy(selection.providerId);
  currentPlaybackUrl = playbackUrl;
  playerStatus = "playing";
  window.webContents.setAudioMuted(false);
  await loadPlayerUrl(window, playbackUrl);
  await startYouTubePlaylistPageIfNeeded(window, playbackUrl, selection.shuffleEnabled);
  await settlePlayerWindow();
  await setupShuffleIfEnabled(window, selection);
  await applyPlaybackVolumeToPlayerWindow(settings.playbackVolume, window);

  showPlayerWindow(window);
  sendActivity("Playlist started");
}

async function stopConfiguredPlaylist(options: { rePreload: boolean; closeWindow: boolean }): Promise<void> {
  ++preloadToken;

  if (!playerWindow || playerWindow.isDestroyed()) {
    playerStatus = "stopped";
    currentPlaybackUrl = null;
    if (options.rePreload) {
      await preloadConfiguredPlaylist();
    }
    return;
  }

  const window = playerWindow;

  try {
    await pausePlayerWindow(window);
    window.webContents.setAudioMuted(true);
    window.removeAllListeners("closed");
    window.close();
    playerWindow = null;
    playerWindowProviderId = null;
  } catch {
    if (!window.isDestroyed()) {
      window.close();
    }
    playerWindow = null;
    playerWindowProviderId = null;
  }

  playerStatus = "stopped";
  currentPlaybackUrl = null;

  if (options.rePreload) {
    await preloadConfiguredPlaylist();
  }
}

function ensurePlayerWindow(options: { show: boolean; providerId: PlaylistProviderId }): BrowserWindow {
  if (playerWindow && !playerWindow.isDestroyed() && playerWindowProviderId === options.providerId) {
    return playerWindow;
  }

  if (playerWindow && !playerWindow.isDestroyed()) {
    playerWindow.removeAllListeners("closed");
    playerWindow.close();
    playerWindow = null;
  }

  playerWindowProviderId = options.providerId;
  playerWindow = new BrowserWindow({
    width: 1100,
    height: 720,
    show: options.show,
    title: "Pull Playlist Player",
    icon: appIconPath,
    backgroundColor: "#000000",
    webPreferences: {
      partition: options.providerId === "youtube" ? YOUTUBE_SESSION_PARTITION : undefined,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  playerWindow.on("closed", () => {
    playerWindow = null;
    playerWindowProviderId = null;
    currentPlaybackUrl = null;
    playerStatus = "idle";
  });
  if (options.providerId === "youtube") {
    attachYouTubeWindowPrivacy(playerWindow);
  }

  return playerWindow;
}

function openYouTubeLoginWindow(): BrowserWindow {
  if (youtubeLoginWindow && !youtubeLoginWindow.isDestroyed()) {
    showPlayerWindow(youtubeLoginWindow);
    return youtubeLoginWindow;
  }

  youtubeLoginWindow = new BrowserWindow({
    width: 1100,
    height: 760,
    show: true,
    title: "YouTube Sign In",
    icon: appIconPath,
    backgroundColor: "#0f0f0f",
    webPreferences: {
      partition: YOUTUBE_SESSION_PARTITION,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  });

  youtubeLoginWindow.on("closed", () => {
    youtubeLoginWindow = null;
    void publishYouTubeAuthStatus();
  });
  attachYouTubeWindowPrivacy(youtubeLoginWindow);

  const window = youtubeLoginWindow;
  void waitForYouTubePrivacy()
    .then(() => {
      if (!window.isDestroyed()) {
        return loadPlayerUrl(window, YOUTUBE_LOGIN_URL);
      }
    })
    .catch((error) => {
      sendPlayerError(error);
    });

  return youtubeLoginWindow;
}

function showPlayerWindow(window: BrowserWindow): void {
  if (window.isMinimized()) {
    window.restore();
  }

  window.show();
  window.focus();
}

async function getYouTubeAuthStatus(): Promise<YouTubeAuthStatus> {
  const youtubeSession = getYouTubeSession();
  const cookies = await Promise.all([
    youtubeSession.cookies.get({ url: "https://www.youtube.com" }),
    youtubeSession.cookies.get({ url: "https://accounts.google.com" })
  ]);
  const signedInCookieNames = new Set([
    "SID",
    "HSID",
    "SSID",
    "APISID",
    "SAPISID",
    "__Secure-1PSID",
    "__Secure-3PSID"
  ]);

  return {
    signedIn: cookies.flat().some((cookie) => signedInCookieNames.has(cookie.name))
  };
}

async function publishYouTubeAuthStatus(): Promise<void> {
  await publishProviderAccountStatus();
}

async function publishProviderAccountStatus(): Promise<void> {
  mainWindow?.webContents.send("app:provider-accounts", await getProviderAccountStates());
}

async function clearYouTubeAccountSession(): Promise<void> {
  if (youtubeLoginWindow && !youtubeLoginWindow.isDestroyed()) {
    youtubeLoginWindow.close();
    youtubeLoginWindow = null;
  }

  await stopConfiguredPlaylist({ rePreload: false, closeWindow: true });
  await clearYouTubeSessionData();
  await publishYouTubeAuthStatus();
}

async function getProviderAccountStates(): Promise<ProviderAccountState[]> {
  const youtubeAuthStatus = await getYouTubeAuthStatus();
  const youtubeLibraryState = await youtubePlaylistLibrary.getState();

  return listPlaylistProviderAccountActions().map((action) => {
    const signedIn = action.providerId === "youtube" ? youtubeAuthStatus.signedIn : false;
    const state: ProviderAccountState = {
      providerId: action.providerId,
      providerLabel: action.providerLabel,
      actionId: action.id,
      label: action.label,
      statusLabel: signedIn ? "Signed in" : "Not signed in",
      actionLabel: signedIn ? action.signedInLabel : action.signedOutLabel,
      logoutLabel: "Log out",
      canLogout: signedIn,
      signedIn
    };

    if (action.providerId === "youtube") {
      const privacyStatus = getYouTubePrivacyStatus();
      state.libraryStatusLabel = youtubeLibraryState.statusLabel;
      state.libraryConnected = youtubeLibraryState.connected;
      state.libraryCanDisconnect = youtubeLibraryState.canDisconnect;
      state.privacyStatus = privacyStatus;
      state.privacyStatusLabel = formatYouTubePrivacyStatus(privacyStatus);
    }

    return state;
  });
}

async function loadLocalPlayer(
  window: BrowserWindow,
  tracks: LocalMediaTrack[],
  shuffleEnabled: boolean,
  preloadOnly: boolean,
  volume: number
): Promise<void> {
  await withTimeout(
    window.loadFile(localPlayerPath),
    PLAYER_LOAD_TIMEOUT_MS,
    "Timed out loading local media player"
  );
  await window.webContents.executeJavaScript(
    `window.localMediaPlayer.loadQueue(${JSON.stringify({
      tracks,
      shuffleEnabled,
      preloadOnly,
      volume: normalizePlaybackVolume(volume)
    })});`
  );
  await applyPlaybackVolumeToPlayerWindow(volume, window);
}

async function playLocalPlayerWindow(window: BrowserWindow): Promise<void> {
  await window.webContents
    .executeJavaScript("window.localMediaPlayer.playFromStart();")
    .catch(() => undefined);
}

function formatYouTubePrivacyStatus(status: YouTubePrivacyStatus): string {
  const blockedCount = Object.values(status.blockedRequestCounts).reduce((total, count) => total + count, 0);

  if (status.initializationState === "ready") {
    return `Privacy/request blocking ready${blockedCount > 0 ? `; ${blockedCount} requests filtered` : ""}`;
  }

  if (status.initializationState === "failed") {
    return `Privacy/request blocking unavailable${status.lastError ? `: ${status.lastError}` : ""}`;
  }

  return "Privacy/request blocking starting";
}

async function waitForYouTubePrivacy(): Promise<void> {
  youtubePrivacyReady ??= configureYouTubeSessionPrivacy();
  await youtubePrivacyReady;
}

async function waitForProviderPrivacy(providerId: PlaylistProviderId): Promise<void> {
  if (providerId === "youtube") {
    await waitForYouTubePrivacy();
  }
}

function buildPlaybackUrl(pullEvent?: PullEvent): string {
  const rule = selectPlaylistRule(getPlaylistRules(), pullEvent ?? {});
  const provider = getPlaylistProvider(rule.providerId);
  return provider.buildPlaybackUrl(rule.selection);
}

function hasConfiguredPlaylistSelection(selection: PlaylistRule["selection"]): boolean {
  if (selection.providerId === "local") {
    const localMedia = selection.localMedia ?? { filePaths: [], folderPaths: [] };
    return localMedia.filePaths.length > 0 || localMedia.folderPaths.length > 0;
  }

  return Boolean(selection.playlistUrlOrId.trim() || selection.playlistId);
}

function getPlaybackSelection(pullEvent?: PullEvent): PlaylistRule["selection"] {
  return selectPlaylistRule(getPlaylistRules(), pullEvent ?? {}).selection;
}

function getPlaylistRules(): PlaylistRule[] {
  return [createDefaultPlaylistRule(settings.defaultPlaylist), ...settings.playlistRules];
}

function validatePlaylistSettings(
  defaultPlaylist: PlaylistRuleSettings,
  playlistRules: PlaylistRule[]
): void {
  validatePlaylistInput(defaultPlaylist, "Default playlist");

  for (const rule of playlistRules) {
    validatePlaylistInput(rule, `Boss cue "${rule.label || rule.encounterName || rule.encounterId || "unnamed"}"`);
    if (!rule.encounterId?.trim() && !rule.encounterName?.trim()) {
      throw new Error("Each encounter playlist needs an encounter ID or name.");
    }
  }
}

function validatePlaylistInput(settings: PlaylistRuleSettings, context: string): void {
  const normalized = migratePlaylistRuleSettings(settings);
  try {
    getPlaylistProvider(normalized.providerId).buildPlaybackUrl(normalized.selection);
  } catch (error) {
    const provider = getPlaylistProvider(normalized.providerId);
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${context} (${provider.label}): ${message}`);
  }
}

function normalizePlaylistSettings(settings: PlaylistRuleSettings): PlaylistRuleSettings {
  const migrated = migratePlaylistRuleSettings(settings);
  const selection = normalizePlaylistSelection(
    migrated.selection,
    migrated.providerId,
    migrated.playlistUrlOrId
  );

  return {
    providerId: selection.providerId,
    playlistUrlOrId: selection.playlistUrlOrId,
    selection
  };
}

function normalizePlaylistRule(rule: PlaylistRule): PlaylistRule {
  const settings = normalizePlaylistSettings(rule);

  return {
    id: rule.id.trim() || randomUUID(),
    label: rule.label.trim() || rule.encounterName?.trim() || rule.encounterId?.trim() || "Encounter playlist",
    providerId: settings.providerId,
    playlistUrlOrId: settings.playlistUrlOrId,
    selection: settings.selection,
    encounterId: rule.encounterId?.trim() || undefined,
    encounterName: rule.encounterName?.trim() || undefined,
    isDefault: false
  };
}

function addSeenEncounter(pullEvent: PullEvent): void {
  if (!pullEvent.encounterId) {
    return;
  }

  const existing = settings.seenEncounters.find(
    (encounter) => encounter.encounterId === pullEvent.encounterId
  );
  const nextEncounter: EncounterInfo = {
    encounterId: pullEvent.encounterId,
    encounterName: pullEvent.encounterName,
    difficultyId: pullEvent.difficultyId,
    groupSize: pullEvent.groupSize
  };

  if (existing) {
    Object.assign(existing, nextEncounter);
  } else {
    settings.seenEncounters.push(nextEncounter);
  }

  void persistSettings();
  mainWindow?.webContents.send("app:seen-encounters", settings.seenEncounters);
}

async function pausePlayerWindow(window: BrowserWindow): Promise<void> {
  await window.webContents
    .executeJavaScript(
      `(() => {
        const media = document.querySelector("video, audio");
        if (media) {
          media.pause();
          media.currentTime = 0;
        }
      })();`
    )
    .catch(() => undefined);
}

async function playPlayerWindow(window: BrowserWindow): Promise<void> {
  await window.webContents
    .executeJavaScript(
      `(() => {
        const media = document.querySelector("video, audio");
        if (media) {
          media.currentTime = 0;
          return media.play().catch(() => undefined);
        }

        const buttons = Array.from(document.querySelectorAll("button"));
        const playButton = buttons.find((button) => {
          const label = [
            button.getAttribute("aria-label"),
            button.getAttribute("title"),
            button.textContent
          ].filter(Boolean).join(" ").toLowerCase();
          return label.includes("play");
        });
        playButton?.click();
      })();`
    )
    .catch(() => undefined);
}

async function applyPlaybackVolumeToPlayerWindow(
  volume: number,
  window = playerWindow
): Promise<void> {
  if (!window || window.isDestroyed()) {
    return;
  }

  await applyPlaybackVolumeToWebContents(window.webContents, volume);
}

async function startYouTubePlaylistPageIfNeeded(
  window: BrowserWindow,
  playbackUrl: string,
  shuffleEnabled = false
): Promise<void> {
  const playlistId = getYouTubePlaylistPageId(playbackUrl);
  if (!playlistId) {
    return;
  }

  await window.webContents
    .executeJavaScript(
      `(() => new Promise((resolve) => {
        let done = false;
        let interval;
        let timeout;
        const finish = (value) => {
          if (done) {
            return;
          }
          done = true;
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(Boolean(value));
        };

        const findAndClickPlaylistVideo = () => {
          const links = Array.from(document.querySelectorAll("a[href*='/watch?']"));
          const playlistVideoById = new Map();
          for (const link of links) {
            try {
              const url = new URL(link.href);
              const videoId = url.searchParams.get("v");
              if (url.searchParams.get("list") === ${JSON.stringify(playlistId)} && videoId && !playlistVideoById.has(videoId)) {
                playlistVideoById.set(videoId, link);
              }
            } catch {
              // Ignore malformed links rendered by YouTube experiments.
            }
          }
          const playlistVideos = Array.from(playlistVideoById.values());

          if (playlistVideos.length === 0) {
            return false;
          }

          const selectedIndex = ${JSON.stringify(shuffleEnabled)}
            ? Math.min(playlistVideos.length - 1, Math.floor(Math.random() * Math.max(playlistVideos.length - 1, 1)) + 1)
            : 0;
          playlistVideos[selectedIndex].click();
          return true;
        };

        const tryStart = () => {
          if (findAndClickPlaylistVideo()) {
            finish(true);
          }
        };

        tryStart();
        interval = setInterval(tryStart, 250);
        timeout = setTimeout(() => {
          finish(false);
        }, 5000);
      }))();`
    )
    .catch(() => undefined);
}

function getYouTubePlaylistPageId(value: string): string | null {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || !isYouTubeHost(url.hostname) || url.pathname !== "/playlist") {
      return null;
    }

    return url.searchParams.get("list");
  } catch {
    return null;
  }
}

async function setupShuffleIfEnabled(
  window: BrowserWindow,
  selection: PlaylistRule["selection"]
): Promise<void> {
  if (selection.providerId !== "youtube" || !selection.shuffleEnabled) {
    return;
  }

  try {
    const shuffled = await window.webContents.executeJavaScript(
      `(() => new Promise((resolve) => {
        let done = false;
        let interval;
        let timeout;
        let iframeApiRequested = false;
        const finish = (value) => {
          if (done) {
            return;
          }
          done = true;
          clearInterval(interval);
          clearTimeout(timeout);
          resolve(Boolean(value));
        };
        const playFromShuffledStart = (player) => {
          player.setShuffle(true);
          if (typeof player.playVideo === "function") {
            player.playVideo();
          }
        };
        const getShuffleButton = () => Array.from(document.querySelectorAll("button, [role='button']")).find((control) => {
          const label = [
            control.getAttribute("aria-label"),
            control.getAttribute("title"),
            control.textContent
          ].filter(Boolean).join(" ").toLowerCase();
          return label.includes("shuffle");
        });
        const isShuffleButtonOn = () => getShuffleButton()?.getAttribute("aria-pressed") === "true";
        const enableVisibleShuffleButton = () => {
          const button = getShuffleButton();
          if (!button) {
            return false;
          }

          if (button.getAttribute("aria-pressed") !== "true") {
            button.click();
          }

          return button.getAttribute("aria-pressed") === "true";
        };
        const waitForVisibleShuffle = () => {
          let attempts = 0;
          const check = () => {
            if (isShuffleButtonOn() || enableVisibleShuffleButton()) {
              finish(true);
              return;
            }

            attempts += 1;
            if (attempts >= 20) {
              finish(false);
              return;
            }

            setTimeout(check, 250);
          };
          check();
        };

        const ready = () => {
          const iframe = document.querySelector("iframe");
          if (!iframe) {
            finish(false);
            return;
          }

          try {
            const player = new window.YT.Player(iframe, {
              events: {
                onReady: () => {
                  playFromShuffledStart(player);
                  waitForVisibleShuffle();
                },
                onError: () => finish(false)
              }
            });
          } catch {
            finish(false);
          }
        };

        const tryShuffle = () => {
          const nativePlayer = document.querySelector("#movie_player");
          if (nativePlayer && typeof nativePlayer.setShuffle === "function") {
            playFromShuffledStart(nativePlayer);
            waitForVisibleShuffle();
            return true;
          }

          const iframe = document.querySelector("iframe");
          if (!iframe) {
            return false;
          }

          if (window.YT?.Player) {
            ready();
            return true;
          }

          if (!iframeApiRequested) {
            iframeApiRequested = true;
            window.onYouTubeIframeAPIReady = ready;
            const script = document.createElement("script");
            script.src = "https://www.youtube.com/iframe_api";
            script.onerror = () => finish(false);
            document.head.append(script);
          }
          return true;
        };

        if (tryShuffle()) {
          return;
        }

        interval = setInterval(tryShuffle, 250);
        timeout = setTimeout(() => finish(false), 5000);
      }))();`
    );

    if (shuffled) {
      sendActivity("YouTube shuffle enabled");
    } else {
      sendActivity("Player warning: YouTube shuffle could not be enabled; playback is continuing");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    sendActivity(`Player warning: YouTube shuffle could not be enabled; playback is continuing (${message})`);
  }
}

async function settlePlayerWindow(): Promise<void> {
  await new Promise((resolve) => {
    setTimeout(resolve, PLAYER_SETTLE_MS);
  });
}

async function loadPlayerUrl(window: BrowserWindow, url: string): Promise<void> {
  try {
    await withTimeout(
      window.loadURL(url, getPlayerLoadOptions(url)),
      PLAYER_LOAD_TIMEOUT_MS,
      `Timed out loading ${url}`
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const code = parseElectronErrorCode(message);
    if (code === "ERR_ABORTED" || code === "ERR_FAILED") {
      throw new PlayerLoadError(`Player navigation was interrupted while loading ${url}`, code);
    }

    throw error;
  }
}

function getPlayerLoadOptions(url: string): Parameters<BrowserWindow["loadURL"]>[1] | undefined {
  if (!isYouTubeEmbedUrl(url)) {
    return undefined;
  }

  return {
    httpReferrer: {
      url: YOUTUBE_EMBED_REFERRER,
      policy: "strict-origin-when-cross-origin"
    }
  };
}

function isYouTubeEmbedUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && isYouTubeHost(url.hostname) && url.pathname.startsWith("/embed");
  } catch {
    return false;
  }
}

function isYouTubeHost(hostname: string): boolean {
  const normalized = hostname.toLocaleLowerCase();
  return normalized === "youtube.com" || normalized.endsWith(".youtube.com");
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => reject(new Error(message)), timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeout) {
      clearTimeout(timeout);
    }
  }
}

function sendPullActivity(pullEvent: PullEvent): void {
  const encounter = pullEvent.encounterName ? `: ${pullEvent.encounterName}` : "";
  sendActivity(pullEvent.type === "pull-started" ? `Pull detected${encounter}` : `Pull ended${encounter}`);
}

function sendWatcherError(message: string): void {
  mainWindow?.webContents.send("app:watch-error", message);
  sendActivity(`Watcher error: ${message}`);
}

function sendPlayerError(error: unknown): void {
  const message = error instanceof Error ? error.message : String(error);
  sendActivity(`Player warning: ${message}`);
}

function parseElectronErrorCode(message: string): string | undefined {
  return message.match(/\b(ERR_[A-Z_]+)\b/)?.[1];
}

function sendActivity(message: string): void {
  const event: AppActivityEvent = {
    message,
    timestamp: new Date().toLocaleTimeString()
  };

  mainWindow?.webContents.send("app:activity-event", event);
}

async function persistSettings(): Promise<void> {
  try {
    await saveSettingsToDisk(settings);
  } catch (error) {
    sendPlayerError(error);
  }
}

function getYouTubeOAuthClientCredentials(): YouTubeOAuthClientCredentials {
  const clientId = settings.youtubeOAuthClientId.trim() || process.env.YOUTUBE_OAUTH_CLIENT_ID?.trim();
  if (!clientId) {
    throw new Error("Add a YouTube OAuth Client ID in Settings before connecting your playlist library.");
  }

  return {
    clientId,
    clientSecret:
      settings.youtubeOAuthClientSecret.trim() || process.env.YOUTUBE_OAUTH_CLIENT_SECRET?.trim() || undefined
  };
}
