import assert from "node:assert/strict";
import test from "node:test";
import { createSettingsJsonForDisk, migrateRawSettings, normalizePlaybackVolume } from "./settingsStore";

test("migrates legacy local media volume to global playback volume", () => {
  const settings = migrateRawSettings({
    localMediaVolume: 0.35
  });

  assert.equal(settings.playbackVolume, 0.35);
});

test("defaults invalid playback volume to full volume", () => {
  assert.equal(migrateRawSettings({ playbackVolume: Number.NaN }).playbackVolume, 1);
  assert.equal(migrateRawSettings({ playbackVolume: "quiet" }).playbackVolume, 1);
});

test("normalizes playback volume to a zero-to-one range", () => {
  assert.equal(normalizePlaybackVolume(-0.25), 0);
  assert.equal(normalizePlaybackVolume(1.25), 1);
  assert.equal(normalizePlaybackVolume(0.5), 0.5);
});

test("settings written to disk no longer include legacy local media volume", () => {
  const settings = migrateRawSettings({
    playbackVolume: 0.42,
    localMediaVolume: 0.35
  });

  const json = createSettingsJsonForDisk(settings);

  assert.equal(json.playbackVolume, 0.42);
  assert.equal("localMediaVolume" in json, false);
});
