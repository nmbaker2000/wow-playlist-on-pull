import { app, safeStorage } from "electron";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  createManualPlaylistSelection,
  migratePlaylistRule,
  migratePlaylistRuleSettings,
  type PlaylistRule,
  type PlaylistRuleSettings
} from "./playlistRules";

export interface EncounterInfo {
  encounterId: string;
  encounterName?: string;
  difficultyId?: number;
  groupSize?: number;
}

export interface AppSettings {
  logPath: string | null;
  theme: "dark" | "light";
  youtubeOAuthClientId: string;
  youtubeOAuthClientSecret: string;
  defaultPlaylist: PlaylistRuleSettings;
  playlistRules: PlaylistRule[];
  seenEncounters: EncounterInfo[];
  preloadEnabled: boolean;
  localMediaVolume: number;
}

export function createDefaultSettings(): AppSettings {
  return {
    logPath: null,
    theme: "dark",
    youtubeOAuthClientId: "",
    youtubeOAuthClientSecret: "",
    defaultPlaylist: {
      providerId: "youtube",
      playlistUrlOrId: "",
      selection: createManualPlaylistSelection("youtube", "")
    },
    playlistRules: [],
    seenEncounters: [],
    preloadEnabled: true,
    localMediaVolume: 1
  };
}

export async function loadSettings(): Promise<AppSettings> {
  const defaults = createDefaultSettings();

  try {
    const raw = JSON.parse(await readFile(getSettingsPath(), "utf8")) as Partial<AppSettings>;
    return {
      logPath: typeof raw.logPath === "string" ? raw.logPath : null,
      theme: raw.theme === "light" ? "light" : "dark",
      youtubeOAuthClientId: (await readEncryptedValue("youtube-oauth-client-id.enc")) || (typeof raw.youtubeOAuthClientId === "string" ? raw.youtubeOAuthClientId : ""),
      youtubeOAuthClientSecret: (await readEncryptedValue("youtube-oauth-client-secret.enc")) || "",
      defaultPlaylist: migratePlaylistRuleSettings(raw.defaultPlaylist ?? defaults.defaultPlaylist),
      playlistRules: (raw.playlistRules ?? []).map((rule) => migratePlaylistRule(rule)),
      seenEncounters: Array.isArray(raw.seenEncounters) ? raw.seenEncounters : [],
      preloadEnabled: typeof raw.preloadEnabled === "boolean" ? raw.preloadEnabled : true,
      localMediaVolume: normalizeVolume(raw.localMediaVolume)
    };
  } catch {
    return defaults;
  }
}

export async function saveSettingsToDisk(settings: AppSettings): Promise<void> {
  const settingsPath = getSettingsPath();
  const { youtubeOAuthClientId, youtubeOAuthClientSecret, ...settingsJson } = settings;
  await writeEncryptedValue("youtube-oauth-client-id.enc", youtubeOAuthClientId, "YouTube OAuth Client ID");
  await writeEncryptedValue("youtube-oauth-client-secret.enc", youtubeOAuthClientSecret, "YouTube OAuth Client Secret");
  await mkdir(path.dirname(settingsPath), { recursive: true });
  await writeFile(settingsPath, `${JSON.stringify(settingsJson, null, 2)}\n`, "utf8");
}

function getSettingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readEncryptedValue(fileName: string): Promise<string> {
  try {
    const encrypted = Buffer.from(await readFile(getEncryptedPath(fileName), "utf8"), "base64");
    return safeStorage.decryptString(encrypted);
  } catch {
    return "";
  }
}

async function writeEncryptedValue(fileName: string, value: string, label: string): Promise<void> {
  const encryptedPath = getEncryptedPath(fileName);
  if (!value.trim()) {
    await rm(encryptedPath, { force: true });
    return;
  }

  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error(`Secure storage is unavailable on this computer, so the ${label} was not saved.`);
  }

  await mkdir(path.dirname(encryptedPath), { recursive: true });
  const encrypted = safeStorage.encryptString(value.trim());
  await writeFile(encryptedPath, encrypted.toString("base64"), "utf8");
}

function getEncryptedPath(fileName: string): string {
  return path.join(app.getPath("userData"), fileName);
}

function normalizeVolume(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return 1;
  }

  return Math.min(1, Math.max(0, value));
}
