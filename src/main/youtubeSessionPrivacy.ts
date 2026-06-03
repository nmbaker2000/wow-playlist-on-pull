import { adsAndTrackingLists, ElectronBlocker } from "@ghostery/adblocker-electron";
import { app, BrowserWindow, shell, session } from "electron";
import { promises as fs } from "node:fs";
import path from "node:path";

export const YOUTUBE_SESSION_PARTITION = "persist:youtube";

export type YouTubePrivacyInitializationState = "pending" | "ready" | "failed";

export interface YouTubePrivacyStatus {
  initializationState: YouTubePrivacyInitializationState;
  blockingEnabled: boolean;
  lastError: string | null;
  cacheStatus: "unknown" | "fresh" | "expired" | "rebuilt";
  blockedRequestCounts: Record<string, number>;
}

interface CreateCachedYouTubeBlockerOptions {
  fetch: typeof globalThis.fetch;
  cachePath: string;
  read: typeof fs.readFile;
  write: typeof fs.writeFile;
  unlink?: typeof fs.unlink;
  stat?: typeof fs.stat;
  maxCacheAgeMs?: number;
  now?: () => number;
  createBlocker?: typeof ElectronBlocker.fromLists;
}

const YOUTUBE_BLOCKER_CACHE_TTL_MS = 24 * 60 * 60 * 1000;
const ALLOWED_YOUTUBE_TOP_LEVEL_NAVIGATION_HOSTS = new Set([
  "www.youtube.com",
  "youtube.com",
  "accounts.google.com"
]);

let blockerReady: Promise<void> | null = null;
let blocker: ElectronBlocker | null = null;
let privacyStatus: YouTubePrivacyStatus = createInitialYouTubePrivacyStatus();

export function getYouTubeSession(): Electron.Session {
  return session.fromPartition(YOUTUBE_SESSION_PARTITION);
}

export function getYouTubePrivacyStatus(): YouTubePrivacyStatus {
  return {
    ...privacyStatus,
    blockedRequestCounts: { ...privacyStatus.blockedRequestCounts }
  };
}

export async function clearYouTubeSessionData(): Promise<void> {
  const youtubeSession = getYouTubeSession();
  await Promise.all([
    youtubeSession.clearStorageData({
      storages: [
        "cookies",
        "filesystem",
        "indexdb",
        "localstorage",
        "shadercache",
        "websql",
        "serviceworkers",
        "cachestorage"
      ]
    }),
    youtubeSession.clearCache()
  ]);
}

export function configureYouTubeSessionPrivacy(): Promise<void> {
  const youtubeSession = getYouTubeSession();

  youtubeSession.setPermissionRequestHandler((_webContents, _permission, callback) => {
    callback(false);
  });

  youtubeSession.setPermissionCheckHandler(() => false);

  youtubeSession.on("will-download", (event) => {
    event.preventDefault();
  });

  blockerReady ??= enableRequestBlocker(youtubeSession);
  return blockerReady;
}

export function attachYouTubeWindowPrivacy(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(({ url }) => {
    openExternalHttpsUrl(url);
    return { action: "deny" };
  });

  window.webContents.on("will-navigate", (event, url) => {
    if (isAllowedYouTubeBrowserUrl(url)) {
      return;
    }

    event.preventDefault();
    openExternalHttpsUrl(url);
  });
}

export async function createCachedYouTubeBlocker(
  options: CreateCachedYouTubeBlockerOptions
): Promise<ElectronBlocker> {
  const createBlocker = options.createBlocker ?? ElectronBlocker.fromLists.bind(ElectronBlocker);
  const readCache = createExpiringCacheReader(options);
  const cache = {
    path: options.cachePath,
    read: readCache,
    write: options.write
  };
  const blockerConfig = {
    enableMutationObserver: false,
    loadCosmeticFilters: false,
    loadNetworkFilters: true
  };

  try {
    return (await createBlocker(options.fetch, adsAndTrackingLists, blockerConfig, cache)) as ElectronBlocker;
  } catch (error) {
    await options.unlink?.(options.cachePath).catch(() => undefined);
    try {
      return (await createBlocker(options.fetch, adsAndTrackingLists, blockerConfig, cache)) as ElectronBlocker;
    } catch (retryError) {
      throw retryError;
    }
  }
}

export function createInitialYouTubePrivacyStatus(): YouTubePrivacyStatus {
  return {
    initializationState: "pending",
    blockingEnabled: false,
    lastError: null,
    cacheStatus: "unknown",
    blockedRequestCounts: {}
  };
}

export function markYouTubePrivacyReady(
  status: YouTubePrivacyStatus,
  blockingEnabled: boolean
): YouTubePrivacyStatus {
  return {
    ...status,
    initializationState: "ready",
    blockingEnabled,
    lastError: null
  };
}

export function markYouTubePrivacyFailed(status: YouTubePrivacyStatus, error: unknown): YouTubePrivacyStatus {
  return {
    ...status,
    initializationState: "failed",
    blockingEnabled: false,
    lastError: error instanceof Error ? error.message : String(error)
  };
}

function createExpiringCacheReader(options: CreateCachedYouTubeBlockerOptions): typeof fs.readFile {
  return (async (cachePath: Parameters<typeof fs.readFile>[0], readOptions?: Parameters<typeof fs.readFile>[1]) => {
    const maxCacheAgeMs = options.maxCacheAgeMs ?? YOUTUBE_BLOCKER_CACHE_TTL_MS;
    if (options.stat) {
      const statPath = cachePath as Parameters<typeof fs.stat>[0];
      const stats = await options.stat(statPath);
      const ageMs = (options.now ?? Date.now)() - stats.mtimeMs;
      if (ageMs > maxCacheAgeMs) {
        privacyStatus = { ...privacyStatus, cacheStatus: "expired" };
        await options.unlink?.(statPath).catch(() => undefined);
        throw new Error(`YouTube blocker cache is older than ${maxCacheAgeMs}ms.`);
      }

      privacyStatus = { ...privacyStatus, cacheStatus: "fresh" };
    }

    return options.read(cachePath, readOptions as never);
  }) as typeof fs.readFile;
}

async function enableRequestBlocker(
  youtubeSession: Electron.Session
): Promise<void> {
  const blockerCachePath = path.join(app.getPath("userData"), "youtube-network-adblock-engine.bin");

  privacyStatus = {
    ...privacyStatus,
    initializationState: "pending",
    blockingEnabled: false,
    lastError: null
  };

  try {
    blocker = await createCachedYouTubeBlocker({
      fetch: globalThis.fetch,
      cachePath: blockerCachePath,
      read: fs.readFile,
      write: fs.writeFile,
      unlink: fs.unlink,
      stat: fs.stat
    });
    attachBlockerMetrics(blocker);
    blocker.enableBlockingInSession(youtubeSession);
    privacyStatus = {
      ...markYouTubePrivacyReady(privacyStatus, blocker.isBlockingEnabled(youtubeSession)),
      cacheStatus:
        privacyStatus.cacheStatus === "fresh" || privacyStatus.cacheStatus === "expired"
          ? privacyStatus.cacheStatus
          : "rebuilt"
    };
  } catch (error) {
    privacyStatus = markYouTubePrivacyFailed(privacyStatus, error);
  }
}

function attachBlockerMetrics(nextBlocker: ElectronBlocker): void {
  const originalOnBeforeRequest = nextBlocker.onBeforeRequest.bind(nextBlocker);
  nextBlocker.onBeforeRequest = (details, callback) => {
    originalOnBeforeRequest(details, (response) => {
      const resourceType = details.resourceType || "other";
      if (response.cancel || response.redirectURL) {
        privacyStatus.blockedRequestCounts[resourceType] =
          (privacyStatus.blockedRequestCounts[resourceType] ?? 0) + 1;
      }
      callback(response);
    });
  };
}

function openExternalHttpsUrl(value: string): void {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      void shell.openExternal(url.toString());
    }
  } catch {
    // Ignore malformed navigation attempts.
  }
}

export function isAllowedYouTubeBrowserUrl(value: string): boolean {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" && url.protocol !== "about:") {
      return false;
    }

    return url.protocol === "about:" || ALLOWED_YOUTUBE_TOP_LEVEL_NAVIGATION_HOSTS.has(url.hostname);
  } catch {
    return false;
  }
}
