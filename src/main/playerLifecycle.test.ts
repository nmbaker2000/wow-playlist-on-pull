import assert from "node:assert/strict";
import test from "node:test";
import { choosePlaybackPlan, getPlaybackRoute } from "./playerLifecycle";

test("uses preloaded player when preload is enabled and URL is ready", () => {
  assert.deepEqual(
    choosePlaybackPlan({
      preloadEnabled: true,
      playerStatus: "ready",
      currentPlaybackUrl: "https://example.test/playlist",
      targetPlaybackUrl: "https://example.test/playlist"
    }),
    {
      usePreloadedPlayer: true,
      shouldLoadTargetUrl: false
    }
  );
});

test("loads target URL when preload is disabled", () => {
  assert.deepEqual(
    choosePlaybackPlan({
      preloadEnabled: false,
      playerStatus: "ready",
      currentPlaybackUrl: "https://example.test/playlist",
      targetPlaybackUrl: "https://example.test/playlist"
    }),
    {
      usePreloadedPlayer: false,
      shouldLoadTargetUrl: true
    }
  );
});

test("loads target URL when preloaded URL does not match", () => {
  assert.equal(
    choosePlaybackPlan({
      preloadEnabled: true,
      playerStatus: "ready",
      currentPlaybackUrl: "https://example.test/old",
      targetPlaybackUrl: "https://example.test/new"
    }).shouldLoadTargetUrl,
    true
  );
});

test("routes URL providers through player windows", () => {
  assert.equal(getPlaybackRoute("youtube"), "browser-window");
});

test("routes local media through the local player and supports preload reuse", () => {
  assert.equal(getPlaybackRoute("local"), "local-media");
  assert.equal(
    choosePlaybackPlan({
      preloadEnabled: true,
      playerStatus: "ready",
      currentPlaybackUrl: "local-media:{\"filePaths\":[\"song.mp3\"],\"folderPaths\":[]}",
      targetPlaybackUrl: "local-media:{\"filePaths\":[\"song.mp3\"],\"folderPaths\":[]}"
    }).usePreloadedPlayer,
    true
  );
});
