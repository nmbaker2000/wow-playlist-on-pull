import type { PullEvent } from "./pullDetector";
import type { PlaylistProviderId, PlaylistSelection } from "./playlistProviders";

type StoredPlaylistProviderId = PlaylistProviderId | "appleMusic" | string;
type StoredPlaylistSelection = Omit<Partial<PlaylistSelection>, "providerId"> & {
  providerId?: StoredPlaylistProviderId;
};
type StoredPlaylistRuleSettings = Omit<Partial<PlaylistRuleSettings>, "providerId" | "selection"> & {
  providerId?: StoredPlaylistProviderId;
  selection?: StoredPlaylistSelection;
};

export interface PlaylistRule {
  id: string;
  label: string;
  providerId: PlaylistProviderId;
  playlistUrlOrId: string;
  selection: PlaylistSelection;
  encounterId?: string;
  encounterName?: string;
  isDefault: boolean;
}

export interface PlaylistRuleSettings {
  providerId: PlaylistProviderId;
  playlistUrlOrId: string;
  selection: PlaylistSelection;
}

export function createDefaultPlaylistRule(settings: PlaylistRuleSettings): PlaylistRule {
  return {
    id: "default",
    label: "Default playlist",
    providerId: settings.providerId,
    playlistUrlOrId: settings.playlistUrlOrId,
    selection: settings.selection,
    isDefault: true
  };
}

export function createManualPlaylistSelection(
  providerId: StoredPlaylistProviderId,
  playlistUrlOrId: string
): PlaylistSelection {
  const normalizedProviderId = normalizeStoredProviderId(providerId);

  return {
    providerId: normalizedProviderId,
    playlistUrlOrId,
    source: "manual",
    shuffleEnabled: false
  };
}

export function migratePlaylistRuleSettings(
  settings: StoredPlaylistRuleSettings
): PlaylistRuleSettings {
  const providerId = normalizeStoredProviderId(settings.providerId ?? settings.selection?.providerId);
  const playlistUrlOrId = settings.playlistUrlOrId ?? settings.selection?.playlistUrlOrId ?? "";
  const selection = normalizePlaylistSelection(
    settings.selection ?? createManualPlaylistSelection(providerId, playlistUrlOrId),
    providerId,
    playlistUrlOrId
  );

  return {
    providerId: selection.providerId,
    playlistUrlOrId: selection.playlistUrlOrId,
    selection
  };
}

export function migratePlaylistRule(rule: Partial<PlaylistRule> & { id: string }): PlaylistRule {
  const settings = migratePlaylistRuleSettings(rule);

  return {
    id: rule.id,
    label: rule.label ?? rule.encounterName ?? rule.encounterId ?? "Encounter playlist",
    providerId: settings.providerId,
    playlistUrlOrId: settings.playlistUrlOrId,
    selection: settings.selection,
    encounterId: rule.encounterId,
    encounterName: rule.encounterName,
    isDefault: Boolean(rule.isDefault)
  };
}

export function normalizePlaylistSelection(
  selection: StoredPlaylistSelection,
  fallbackProviderId: StoredPlaylistProviderId = "youtube",
  fallbackPlaylistUrlOrId = ""
): PlaylistSelection {
  const providerId = normalizeStoredProviderId(selection.providerId ?? fallbackProviderId);
  const playlistUrlOrId = (selection.playlistUrlOrId ?? fallbackPlaylistUrlOrId).trim();
  const source = selection.source ?? (selection.playlistId ? "account" : "manual");
  const normalized: PlaylistSelection = {
    providerId,
    playlistUrlOrId,
    source,
    shuffleEnabled: Boolean(selection.shuffleEnabled)
  };

  const playlistId = selection.playlistId?.trim();
  const playlistTitle = selection.playlistTitle?.trim();
  if (playlistId) {
    normalized.playlistId = playlistId;
  }
  if (playlistTitle) {
    normalized.playlistTitle = playlistTitle;
  }
  if (providerId === "local") {
    const localMedia = selection.localMedia ?? { filePaths: [], folderPaths: [] };
    normalized.localMedia = {
      filePaths: Array.isArray(localMedia.filePaths) ? localMedia.filePaths : [],
      folderPaths: Array.isArray(localMedia.folderPaths) ? localMedia.folderPaths : []
    };
    normalized.source = "local";
    normalized.playlistUrlOrId = "";
  }

  return normalized;
}

function normalizeStoredProviderId(providerId: StoredPlaylistProviderId | undefined): PlaylistProviderId {
  if (providerId === "local") {
    return "local";
  }

  return "youtube";
}

export function selectPlaylistRule(
  rules: PlaylistRule[],
  pullEvent: Pick<PullEvent, "encounterId" | "encounterName">
): PlaylistRule {
  const defaultRule = rules.find((rule) => rule.isDefault) ?? rules[0];
  if (!defaultRule) {
    throw new Error("At least one playlist rule is required.");
  }

  if (pullEvent.encounterId) {
    const encounterIdMatch = rules.find((rule) => rule.encounterId === pullEvent.encounterId);
    if (encounterIdMatch) {
      return encounterIdMatch;
    }
  }

  if (pullEvent.encounterName) {
    const encounterName = normalizeEncounterName(pullEvent.encounterName);
    const encounterNameMatch = rules.find(
      (rule) => rule.encounterName && normalizeEncounterName(rule.encounterName) === encounterName
    );

    if (encounterNameMatch) {
      return encounterNameMatch;
    }
  }

  return defaultRule;
}

function normalizeEncounterName(value: string): string {
  return value.trim().toLocaleLowerCase();
}
