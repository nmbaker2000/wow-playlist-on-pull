import assert from "node:assert/strict";
import test from "node:test";
import {
  createDefaultPlaylistRule,
  createManualPlaylistSelection,
  migratePlaylistRuleSettings,
  selectPlaylistRule,
  PlaylistRule
} from "./playlistRules";

const defaultRule = createDefaultPlaylistRule({
  providerId: "youtube",
  playlistUrlOrId: "PLdefault",
  selection: createManualPlaylistSelection("youtube", "PLdefault")
});

test("creates a default playlist rule from current settings", () => {
  assert.deepEqual(defaultRule, {
    id: "default",
    label: "Default playlist",
    providerId: "youtube",
    playlistUrlOrId: "PLdefault",
    selection: createManualPlaylistSelection("youtube", "PLdefault"),
    isDefault: true
  });
});

test("selects boss playlist by encounter id before encounter name", () => {
  const rules: PlaylistRule[] = [
    defaultRule,
    {
      id: "name-match",
      label: "Name match",
      providerId: "youtube",
      playlistUrlOrId: "PLname",
      selection: createManualPlaylistSelection("youtube", "PLname"),
      encounterName: "Boss",
      isDefault: false
    },
    {
      id: "id-match",
      label: "ID match",
      providerId: "youtube",
      playlistUrlOrId: "PLid",
      selection: createManualPlaylistSelection("youtube", "PLid"),
      encounterId: "123",
      isDefault: false
    }
  ];

  assert.equal(selectPlaylistRule(rules, { encounterId: "123", encounterName: "Boss" }).id, "id-match");
});

test("selects boss playlist by encounter name when id does not match", () => {
  const rules: PlaylistRule[] = [
    defaultRule,
    {
      id: "name-match",
      label: "Name match",
      providerId: "youtube",
      playlistUrlOrId: "PLname",
      selection: createManualPlaylistSelection("youtube", "PLname"),
      encounterName: "Boss",
      isDefault: false
    }
  ];

  assert.equal(selectPlaylistRule(rules, { encounterName: " boss " }).id, "name-match");
});

test("falls back to default playlist rule", () => {
  assert.equal(selectPlaylistRule([defaultRule], { encounterId: "999" }).id, "default");
});

test("throws clearly when no playlist rules exist", () => {
  assert.throws(() => selectPlaylistRule([], { encounterId: "999" }), /At least one playlist rule/);
});

test("migrates legacy playlist settings into a manual YouTube selection", () => {
  assert.deepEqual(
    migratePlaylistRuleSettings({
      providerId: "youtube",
      playlistUrlOrId: "PLlegacy"
    }),
    {
      providerId: "youtube",
      playlistUrlOrId: "PLlegacy",
      selection: createManualPlaylistSelection("youtube", "PLlegacy")
    }
  );
});

test("migrates removed Apple Music Web settings to YouTube", () => {
  assert.deepEqual(
    migratePlaylistRuleSettings({
      providerId: "appleMusic",
      playlistUrlOrId: "pl.u-legacy"
    }),
    {
      providerId: "youtube",
      playlistUrlOrId: "pl.u-legacy",
      selection: createManualPlaylistSelection("youtube", "pl.u-legacy")
    }
  );
});

test("migration preserves local media selections", () => {
  assert.deepEqual(
    migratePlaylistRuleSettings({
      providerId: "local",
      selection: {
        providerId: "local",
        playlistUrlOrId: "ignored",
        source: "local",
        shuffleEnabled: true,
        localMedia: {
          filePaths: ["C:\\Music\\one.mp3"],
          folderPaths: ["C:\\Music\\Raid"]
        }
      }
    }),
    {
      providerId: "local",
      playlistUrlOrId: "",
      selection: {
        providerId: "local",
        playlistUrlOrId: "",
        source: "local",
        shuffleEnabled: true,
        localMedia: {
          filePaths: ["C:\\Music\\one.mp3"],
          folderPaths: ["C:\\Music\\Raid"]
        }
      }
    }
  );
});

test("migration infers local media selections from selection source", () => {
  assert.deepEqual(
    migratePlaylistRuleSettings({
      providerId: "youtube",
      playlistUrlOrId: "C:\\Music\\ignored.mp3",
      selection: {
        playlistUrlOrId: "C:\\Music\\ignored.mp3",
        source: "local",
        shuffleEnabled: true,
        localMedia: {
          filePaths: ["C:\\Music\\one.mp3"],
          folderPaths: []
        }
      }
    }),
    {
      providerId: "local",
      playlistUrlOrId: "",
      selection: {
        providerId: "local",
        playlistUrlOrId: "",
        source: "local",
        shuffleEnabled: true,
        localMedia: {
          filePaths: ["C:\\Music\\one.mp3"],
          folderPaths: []
        }
      }
    }
  );
});

test("migration infers local media selections from local media payload", () => {
  assert.equal(
    migratePlaylistRuleSettings({
      selection: {
        playlistUrlOrId: "",
        shuffleEnabled: false,
        localMedia: {
          filePaths: [],
          folderPaths: ["C:\\Music\\Raid"]
        }
      }
    }).providerId,
    "local"
  );
});

test("migration maps unknown legacy providers to YouTube", () => {
  assert.deepEqual(
    migratePlaylistRuleSettings({
      providerId: "legacy-provider",
      playlistUrlOrId: "PLlegacy"
    }),
    {
      providerId: "youtube",
      playlistUrlOrId: "PLlegacy",
      selection: createManualPlaylistSelection("youtube", "PLlegacy")
    }
  );
});
