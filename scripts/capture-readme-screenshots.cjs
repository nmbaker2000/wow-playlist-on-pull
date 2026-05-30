const { app, BrowserWindow } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const rendererHtml = path.join(rootDir, "dist", "renderer", "index.html");
const outputDir = path.join(rootDir, "docs", "images");
const preloadPath = path.join(outputDir, "screenshot-preload.cjs");

const mockPreload = `
const { contextBridge } = require("electron");

const noop = () => () => undefined;
const state = {
  settings: {
    logPath: "C:\\\\Games\\\\World of Warcraft\\\\_retail_\\\\Logs\\\\WoWCombatLog.txt",
    theme: "dark",
    youtubeOAuthClientId: "123456789012-demo.apps.googleusercontent.com",
    youtubeOAuthClientSecret: "GOCSPX-demo-secret",
    defaultPlaylist: {
      providerId: "youtube",
      playlistUrlOrId: "https://www.youtube.com/playlist?list=PL-Raid-Night",
      selection: {
        providerId: "youtube",
        playlistId: "PL-Raid-Night",
        playlistTitle: "Mythic Pull Mix",
        playlistUrlOrId: "https://www.youtube.com/playlist?list=PL-Raid-Night",
        source: "account",
        shuffleEnabled: true
      }
    },
    playlistRules: [
      {
        id: "rule-1",
        label: "Dimensius, the All-Devouring",
        providerId: "youtube",
        playlistUrlOrId: "https://www.youtube.com/watch?v=demo",
        selection: {
          providerId: "youtube",
          playlistId: "YT-Dimensius",
          playlistTitle: "Final Boss Burn",
          playlistUrlOrId: "https://www.youtube.com/watch?v=demo",
          source: "manual",
          shuffleEnabled: false
        },
        encounterId: "3133",
        encounterName: "Dimensius, the All-Devouring",
        isDefault: false
      },
      {
        id: "rule-2",
        label: "Rik Reverb",
        providerId: "local",
        playlistUrlOrId: "",
        selection: {
          providerId: "local",
          playlistUrlOrId: "",
          source: "local",
          shuffleEnabled: true,
          localMedia: {
            filePaths: ["C:\\\\Music\\\\pull-theme.mp3"],
            folderPaths: ["C:\\\\Music\\\\Raid Night"]
          }
        },
        encounterId: "3014",
        encounterName: "Rik Reverb",
        isDefault: false
      }
    ],
    seenEncounters: [
      { encounterId: "3133", encounterName: "Dimensius, the All-Devouring", difficultyId: 16, groupSize: 20 },
      { encounterId: "3014", encounterName: "Rik Reverb", difficultyId: 15, groupSize: 20 }
    ],
    preloadEnabled: true,
    playbackVolume: 72
  },
  providers: [
    { id: "youtube", label: "YouTube" },
    { id: "local", label: "Local Media" }
  ],
  providerAccounts: [
    {
      providerId: "youtube",
      providerLabel: "YouTube",
      actionId: "youtube-login",
      label: "YouTube Premium playback",
      statusLabel: "Signed in",
      actionLabel: "Sign in",
      logoutLabel: "Sign out",
      canLogout: true,
      signedIn: true,
      libraryStatusLabel: "Playlist library connected",
      libraryConnected: true,
      libraryCanDisconnect: true,
      privacyStatusLabel: "Request blocking ready",
      privacyStatus: {
        initializationState: "ready",
        blockingEnabled: true,
        lastError: null,
        cacheStatus: "fresh",
        blockedRequestCounts: { ads: 12, tracking: 4 }
      }
    }
  ],
  isWatching: true,
  playerStatus: { state: "ready" }
};

contextBridge.exposeInMainWorld("wowPullPlaylist", {
  getState: async () => state,
  selectLog: async () => state.settings.logPath,
  selectLocalMedia: async (_mode, current) => current,
  setLogPath: async (logPath) => (state.settings.logPath = logPath),
  discoverCombatLogs: async () => [
    {
      path: state.settings.logPath,
      sizeBytes: 2048000,
      modifiedAt: new Date().toISOString(),
      clientFolder: "_retail_"
    }
  ],
  saveSettings: async (settings) => Object.assign(state.settings, settings),
  setPlaybackVolume: async (volume) => (state.settings.playbackVolume = volume),
  setTheme: async (theme) => (state.settings.theme = theme),
  saveOAuthCredentials: async (credentials) => credentials,
  startWatching: async () => ({ isWatching: true }),
  stopWatching: async () => ({ isWatching: false }),
  testPlaylist: async () => undefined,
  preloadPlaylist: async () => ({ status: { state: "ready" } }),
  stopPlaylist: async () => ({ status: { state: "stopped" } }),
  openYouTubeLogin: async () => ({ signedIn: true }),
  openProviderAccount: async () => state.providerAccounts,
  clearProviderAccount: async () => state.providerAccounts,
  connectProviderLibrary: async () => ({ connected: true }),
  listProviderPlaylists: async () => [
    {
      providerId: "youtube",
      playlistId: "PL-Raid-Night",
      playlistTitle: "Mythic Pull Mix",
      privacyStatus: "private",
      videoCount: 42
    }
  ],
  disconnectProviderLibrary: async () => ({ connected: false }),
  onPullEvent: noop,
  onWatchError: noop,
  onActivityEvent: (callback) => {
    setTimeout(() => {
      callback({
        message: "Watcher armed and primed Mythic Pull Mix.",
        timestamp: new Date().toISOString()
      });
    }, 250);
    return () => undefined;
  },
  onProviderAccounts: noop,
  onSeenEncounters: noop
});
`;

async function waitForRender(window) {
  await new Promise((resolve) => setTimeout(resolve, 900));
  await window.webContents.executeJavaScript("document.fonts ? document.fonts.ready : Promise.resolve()");
}

async function capture(window, filename) {
  const image = await window.webContents.capturePage();
  await fs.writeFile(path.join(outputDir, filename), image.toPNG());
}

async function click(window, selector) {
  await window.webContents.executeJavaScript(`
    document.querySelector(${JSON.stringify(selector)})?.click();
  `);
  await waitForRender(window);
}

async function showSettingsSection(window, section) {
  await window.webContents.executeJavaScript(`
    document.querySelector('[data-settings-section="${section}"]')?.click();
  `);
  await waitForRender(window);
}

async function main() {
  await fs.access(rendererHtml);
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(preloadPath, mockPreload, "utf8");

  const window = new BrowserWindow({
    width: 1440,
    height: 1000,
    show: false,
    backgroundColor: "#101820",
    webPreferences: {
      contextIsolation: true,
      preload: preloadPath
    }
  });

  await window.loadFile(rendererHtml);
  await waitForRender(window);
  await capture(window, "dashboard.png");

  await click(window, "#openSettings");
  await showSettingsSection(window, "playlistProviders");
  await capture(window, "playlist-providers.png");

  await showSettingsSection(window, "encounterPlaylists");
  await capture(window, "boss-cues.png");

  window.destroy();
  await fs.rm(preloadPath, { force: true });
}

app.whenReady().then(() => {
  main()
    .then(() => app.quit())
    .catch((error) => {
      console.error(error);
      app.exit(1);
    });
});
