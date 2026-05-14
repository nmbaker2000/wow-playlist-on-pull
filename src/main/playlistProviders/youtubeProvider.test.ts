import assert from "node:assert/strict";
import test from "node:test";
import {
  YouTubePlaylistProvider,
  extractYouTubePlaylistId,
  parseYouTubePlaylistInput
} from "./youtubeProvider";

test("extracts playlist id from full YouTube playlist URL", () => {
  assert.equal(
    extractYouTubePlaylistId("https://www.youtube.com/playlist?list=PLabc_123-XYZ"),
    "PLabc_123-XYZ"
  );
});

test("accepts raw playlist id", () => {
  assert.equal(extractYouTubePlaylistId("PLabc_123-XYZ"), "PLabc_123-XYZ");
});

test("keeps video id from YouTube watch playlist URL", () => {
  assert.deepEqual(
    parseYouTubePlaylistInput(
      "https://www.youtube.com/watch?v=yJqZSISuXZM&list=PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I"
    ),
    {
      playlistId: "PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I",
      videoId: "yJqZSISuXZM"
    }
  );
});

test("keeps video id from shortened YouTube playlist URL", () => {
  assert.deepEqual(
    parseYouTubePlaylistInput(
      "https://youtu.be/yJqZSISuXZM?si=abc123&list=PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I"
    ),
    {
      playlistId: "PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I",
      videoId: "yJqZSISuXZM"
    }
  );
});

test("rejects empty playlist input", () => {
  assert.throws(() => extractYouTubePlaylistId("  "), /required/);
});

test("accepts standalone YouTube video URLs as cues", () => {
  assert.deepEqual(
    parseYouTubePlaylistInput("https://www.youtube.com/watch?v=yJqZSISuXZM"),
    {
      playlistId: null,
      videoId: "yJqZSISuXZM"
    }
  );
});

test("playlist id extraction still rejects standalone YouTube video URLs", () => {
  assert.throws(() => extractYouTubePlaylistId("https://www.youtube.com/watch?v=yJqZSISuXZM"), /playlist/);
});

test("rejects URLs without playlist or video identifiers", () => {
  assert.throws(() => extractYouTubePlaylistId("https://www.youtube.com/channel/abc"), /valid YouTube/);
});

test("builds autoplaying watch playlist URL when video id is available", () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({
    playlistUrlOrId:
      "https://www.youtube.com/watch?v=yJqZSISuXZM&list=PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I"
  });
  const url = new URL(playbackUrl);

  assert.equal(url.origin + url.pathname, "https://www.youtube.com/watch");
  assert.equal(url.searchParams.get("v"), "yJqZSISuXZM");
  assert.equal(url.searchParams.get("list"), "PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I");
  assert.equal(url.searchParams.get("autoplay"), "1");
});

test("builds playlist page URL for raw playlist ids", () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({ playlistUrlOrId: "PLabc_123-XYZ" });
  const url = new URL(playbackUrl);

  assert.equal(url.origin + url.pathname, "https://www.youtube.com/playlist");
  assert.equal(url.searchParams.get("list"), "PLabc_123-XYZ");
  assert.equal(url.searchParams.get("autoplay"), "1");
});

test("builds watch URL for standalone video cues", () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({
    playlistUrlOrId: "https://www.youtube.com/watch?v=yJqZSISuXZM",
    shuffleEnabled: true
  });
  const url = new URL(playbackUrl);

  assert.equal(url.origin + url.pathname, "https://www.youtube.com/watch");
  assert.equal(url.searchParams.get("v"), "yJqZSISuXZM");
  assert.equal(url.searchParams.get("list"), null);
  assert.equal(url.searchParams.get("enablejsapi"), null);
  assert.equal(url.searchParams.get("autoplay"), "1");
});

test("builds playback URL from account-selected playlist id", () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({
    playlistUrlOrId: "https://www.youtube.com/playlist?list=PLignored",
    playlistId: "PLaccount_123",
    source: "account"
  });
  const url = new URL(playbackUrl);

  assert.equal(url.origin + url.pathname, "https://www.youtube.com/playlist");
  assert.equal(url.searchParams.get("list"), "PLaccount_123");
  assert.equal(url.searchParams.get("autoplay"), "1");
});

test("adds YouTube JS API flag when shuffle is enabled", () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({
    playlistUrlOrId: "PLabc_123-XYZ",
    shuffleEnabled: true
  });
  const url = new URL(playbackUrl);

  assert.equal(url.origin + url.pathname, "https://www.youtube.com/playlist");
  assert.equal(url.searchParams.get("enablejsapi"), "1");
});

test("ignores watch video id when shuffle is enabled so playback can start from a shuffled playlist item", () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({
    playlistUrlOrId:
      "https://www.youtube.com/watch?v=yJqZSISuXZM&list=PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I",
    shuffleEnabled: true
  });
  const url = new URL(playbackUrl);

  assert.equal(url.origin + url.pathname, "https://www.youtube.com/playlist");
  assert.equal(url.searchParams.get("list"), "PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I");
  assert.equal(url.searchParams.get("v"), null);
  assert.equal(url.searchParams.get("enablejsapi"), "1");
});

test("exposes a provider-specific YouTube Premium account action", () => {
  const provider = new YouTubePlaylistProvider();

  assert.deepEqual(provider.accountAction, {
    id: "youtube-login",
    label: "YouTube Premium",
    signedInLabel: "Manage",
    signedOutLabel: "Sign in"
  });
});
