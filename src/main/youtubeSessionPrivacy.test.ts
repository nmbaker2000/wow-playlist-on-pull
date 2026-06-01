import assert from "node:assert/strict";
import test from "node:test";
import {
  createCachedYouTubeBlocker,
  createInitialYouTubePrivacyStatus,
  isAllowedYouTubeBrowserUrl,
  markYouTubePrivacyFailed,
  markYouTubePrivacyReady
} from "./youtubeSessionPrivacy";

test("tracks YouTube privacy status transitions", () => {
  const pending = createInitialYouTubePrivacyStatus();

  assert.deepEqual(pending, {
    initializationState: "pending",
    blockingEnabled: false,
    lastError: null,
    cacheStatus: "unknown",
    blockedRequestCounts: {}
  });

  const ready = markYouTubePrivacyReady(pending, true);
  assert.equal(ready.initializationState, "ready");
  assert.equal(ready.blockingEnabled, true);
  assert.equal(ready.lastError, null);

  const failed = markYouTubePrivacyFailed(ready, new Error("filter list unavailable"));
  assert.equal(failed.initializationState, "failed");
  assert.equal(failed.blockingEnabled, false);
  assert.equal(failed.lastError, "filter list unavailable");
});

test("expires stale YouTube blocker cache before creating blocker", async () => {
  const removedCachePaths: string[] = [];
  let createCalls = 0;
  let statCalls = 0;
  const createBlocker = (async (...args: unknown[]) => {
    createCalls += 1;
    if (createCalls === 1) {
      const cache = args[3] as { path: string; read: (path: string) => Promise<Buffer> };
      await cache.read(cache.path);
    }
    return {};
  }) as never;

  await createCachedYouTubeBlocker({
    fetch: async () => new Response() as never,
    cachePath: "youtube-network-adblock-engine.bin",
    read: async () => Buffer.from("cache") as never,
    write: async () => undefined,
    unlink: async (cachePath) => {
      removedCachePaths.push(cachePath.toString());
    },
    stat: async () => ({ mtimeMs: statCalls++ === 0 ? 1000 : 5000 }) as never,
    now: () => 5000,
    maxCacheAgeMs: 1000,
    createBlocker
  });

  assert.equal(createCalls, 2);
  assert.deepEqual(removedCachePaths, [
    "youtube-network-adblock-engine.bin",
    "youtube-network-adblock-engine.bin"
  ]);
});

test("recovers from a failed YouTube blocker cache load by clearing cache and retrying", async () => {
  const createdBlocker = {};
  const calls: unknown[] = [];
  const removedCachePaths: string[] = [];
  const createBlocker = (async (...args: unknown[]) => {
    calls.push(args);
    if (calls.length === 1) {
      throw new Error("corrupt cache");
    }
    return createdBlocker;
  }) as never;

  const blocker = await createCachedYouTubeBlocker({
    fetch: async () => new Response() as never,
    cachePath: "youtube-network-adblock-engine.bin",
    read: async () => Buffer.from("cache") as never,
    write: async () => undefined,
    unlink: async (cachePath) => {
      removedCachePaths.push(cachePath.toString());
    },
    createBlocker
  });

  assert.equal(blocker, createdBlocker);
  assert.equal(calls.length, 2);
  assert.deepEqual(removedCachePaths, ["youtube-network-adblock-engine.bin"]);
});

test("allows only exact top-level YouTube session navigation hosts", () => {
  assert.equal(isAllowedYouTubeBrowserUrl("https://www.youtube.com/watch?v=yJqZSISuXZM"), true);
  assert.equal(isAllowedYouTubeBrowserUrl("https://youtube.com/playlist?list=PLabc"), true);
  assert.equal(isAllowedYouTubeBrowserUrl("https://accounts.google.com/signin"), true);
  assert.equal(isAllowedYouTubeBrowserUrl("about:blank"), true);

  assert.equal(isAllowedYouTubeBrowserUrl("https://evil.youtube.com/watch?v=yJqZSISuXZM"), false);
  assert.equal(isAllowedYouTubeBrowserUrl("https://mail.google.com/mail"), false);
  assert.equal(isAllowedYouTubeBrowserUrl("https://fonts.gstatic.com/s/roboto.woff2"), false);
  assert.equal(isAllowedYouTubeBrowserUrl("https://accounts.google.com.evil.test/signin"), false);
  assert.equal(isAllowedYouTubeBrowserUrl("http://www.youtube.com/watch?v=yJqZSISuXZM"), false);
});
