import assert from "node:assert/strict";
import test from "node:test";
import { LocalMediaPlaylistProvider } from "./localMediaProvider";

const provider = new LocalMediaPlaylistProvider();

test("local media provider requires at least one file or folder", () => {
  assert.throws(
    () => provider.buildPlaybackUrl({
      playlistUrlOrId: "",
      source: "local",
      shuffleEnabled: false,
      localMedia: { filePaths: [], folderPaths: [] }
    }),
    /Select at least one local audio file or folder/
  );
});

test("local media provider builds a stable synthetic playback key", () => {
  const first = provider.buildPlaybackUrl({
    playlistUrlOrId: "",
    source: "local",
    shuffleEnabled: false,
    localMedia: { filePaths: ["music/song.mp3"], folderPaths: ["music/library"] }
  });
  const second = provider.buildPlaybackUrl({
    playlistUrlOrId: "",
    source: "local",
    shuffleEnabled: true,
    localMedia: { filePaths: ["music/song.mp3"], folderPaths: ["music/library"] }
  });

  assert.equal(first, second);
  assert.match(first, /^local-media:/);
  assert.doesNotMatch(first, /^https?:\/\//);
});

test("local media provider advertises shuffle support", () => {
  assert.equal(provider.id, "local");
  assert.equal(provider.label, "Local Media");
  assert.equal(provider.supportsShuffle, true);
});
