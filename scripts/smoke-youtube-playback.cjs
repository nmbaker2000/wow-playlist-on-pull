const { app, BrowserWindow } = require("electron");
const { writeFileSync } = require("node:fs");
const { join } = require("node:path");
const { YouTubePlaylistProvider } = require("../dist/main/playlistProviders/youtubeProvider");

const playlistUrl =
  process.argv.find((argument) => !argument.startsWith("--") && argument !== process.argv[0] && argument !== process.argv[1]) ??
  "https://www.youtube.com/watch?v=yJqZSISuXZM&list=PLStOwqei9lEwnucBQn6Ym3MtfF2w0ZB9I";
const shuffleEnabled = process.argv.includes("--shuffle");
const resultPath = join(__dirname, "..", "dist", "youtube-smoke-result.json");

setTimeout(() => {
  writeResult({ error: "Smoke test deadline exceeded." });
  app.exit(2);
}, 30_000).unref();

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");

app.whenReady().then(async () => {
  const provider = new YouTubePlaylistProvider();
  const playbackUrl = provider.buildPlaybackUrl({ playlistUrlOrId: playlistUrl, shuffleEnabled });
  const window = new BrowserWindow({
    width: 1280,
    height: 800,
    show: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  writeResult({ status: "loading", playbackUrl });
  window.loadURL(playbackUrl, getLoadOptions(playbackUrl)).catch((error) => {
    writeResult({ status: "load-url-error", playbackUrl, error: error.message });
  });

  await wait(6_000);
  const playlistStartProbe = await startPlaylistPageIfNeeded(window, playbackUrl, shuffleEnabled);
  await wait(6_000);

  const shuffleProbe = shuffleEnabled
    ? await window.webContents.executeJavaScript(`(() => new Promise((resolve) => {
        const wait = (ms) => new Promise((done) => setTimeout(done, ms));
        const getShuffleControl = () => Array.from(document.querySelectorAll("button, [role='button']")).find((control) => {
          const label = [
            control.getAttribute("aria-label"),
            control.getAttribute("title"),
            control.textContent
          ].filter(Boolean).join(" ").toLowerCase();
          return label.includes("shuffle");
        });
        const getShuffleControlState = () => {
          const control = getShuffleControl();
          return control
            ? {
                ariaLabel: control.getAttribute("aria-label"),
                title: control.getAttribute("title"),
                ariaPressed: control.getAttribute("aria-pressed"),
                text: control.textContent ? control.textContent.trim().slice(0, 120) : ""
              }
            : null;
        };
        const enableVisibleShuffleControl = () => {
          const control = getShuffleControl();
          if (!control) {
            return false;
          }

          if (control.getAttribute("aria-pressed") !== "true") {
            control.click();
          }

          return control.getAttribute("aria-pressed") === "true";
        };
        const sample = (player) => ({
          playlist: typeof player.getPlaylist === "function" ? player.getPlaylist() : null,
          playlistIndex: typeof player.getPlaylistIndex === "function" ? player.getPlaylistIndex() : null,
          videoUrl: typeof player.getVideoUrl === "function" ? player.getVideoUrl() : null,
          videoData: typeof player.getVideoData === "function" ? player.getVideoData() : null
        });

        const finish = (value) => resolve(value);
        const tryProbe = async () => {
          const player = document.querySelector("#movie_player");
          if (!player) {
            finish({ ok: false, reason: "missing #movie_player" });
            return;
          }

          const methods = {
            setShuffle: typeof player.setShuffle === "function",
            playVideoAt: typeof player.playVideoAt === "function",
            getPlaylist: typeof player.getPlaylist === "function",
            getPlaylistIndex: typeof player.getPlaylistIndex === "function"
          };
          if (!methods.setShuffle || !methods.playVideoAt || !methods.getPlaylist) {
            finish({ ok: false, reason: "missing player playlist methods", methods });
            return;
          }

          const before = sample(player);
          const visibleBefore = getShuffleControlState();
          player.setShuffle(true);
          await wait(500);
          const visibleAfterApi = getShuffleControlState();
          enableVisibleShuffleControl();
          await wait(500);
          const afterShuffle = sample(player);
          const visibleAfterControl = getShuffleControlState();
          finish({
            ok: true,
            methods,
            before,
            visibleBefore,
            visibleAfterApi,
            visibleAfterControl,
            afterShuffle,
            playlistChanged: JSON.stringify(before.playlist) !== JSON.stringify(afterShuffle.playlist),
            visibleShuffleOn: visibleAfterControl?.ariaPressed === "true"
          });
        };

        tryProbe().catch((error) => finish({ ok: false, reason: error.message }));
      }))();`)
    : null;

  const result = await window.webContents.executeJavaScript(`({
    href: location.href,
    title: document.title,
    shuffleControls: Array.from(document.querySelectorAll("button, [role='button']"))
      .map((element) => ({
        tagName: element.tagName,
        ariaLabel: element.getAttribute("aria-label"),
        title: element.getAttribute("title"),
        ariaPressed: element.getAttribute("aria-pressed"),
        text: element.textContent ? element.textContent.trim().slice(0, 120) : ""
      }))
      .filter((control) => [control.ariaLabel, control.title, control.text].filter(Boolean).join(" ").toLowerCase().includes("shuffle")),
    text: document.body ? document.body.innerText.slice(0, 4000) : ""
  })`);

  const text = `${result.title}\n${result.text}`;
  const hasKnownPlayerError =
    /Error\s*(code\s*)?:?\s*15[23]/i.test(text) || /152\s*-\s*4/i.test(text);

  writeResult({ status: "inspected", playbackUrl, playlistStartProbe, shuffleProbe, ...result, hasKnownPlayerError });

  app.exit(hasKnownPlayerError ? 1 : 0);
});

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function writeResult(result) {
  writeFileSync(resultPath, JSON.stringify(result, null, 2));
}

async function startPlaylistPageIfNeeded(window, playbackUrl, shuffleEnabled) {
  const playlistId = getYouTubePlaylistPageId(playbackUrl);
  if (!playlistId) {
    return null;
  }

  return window.webContents.executeJavaScript(
    `(() => new Promise((resolve) => {
      const finish = (value) => resolve(value);
      const links = Array.from(document.querySelectorAll("a[href*='/watch?']"));
      const playlistVideoById = new Map();
      for (const link of links) {
        try {
          const url = new URL(link.href);
          const videoId = url.searchParams.get("v");
          if (url.searchParams.get("list") === ${JSON.stringify(playlistId)} && videoId && !playlistVideoById.has(videoId)) {
            playlistVideoById.set(videoId, link);
          }
        } catch {
          // Ignore malformed links rendered by YouTube experiments.
        }
      }
      const playlistVideos = Array.from(playlistVideoById.values());

      if (playlistVideos.length === 0) {
        finish({ clicked: false, reason: "no playlist videos found" });
        return;
      }

      const selectedIndex = ${JSON.stringify(shuffleEnabled)}
        ? Math.min(playlistVideos.length - 1, Math.floor(Math.random() * Math.max(playlistVideos.length - 1, 1)) + 1)
        : 0;
      const selectedUrl = playlistVideos[selectedIndex].href;
      playlistVideos[selectedIndex].click();
      finish({ clicked: true, selectedIndex, selectedUrl, videoCount: playlistVideos.length });
    }))();`
  );
}

function getYouTubePlaylistPageId(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    if (
      url.protocol !== "https:" ||
      !(host === "youtube.com" || host.endsWith(".youtube.com")) ||
      url.pathname !== "/playlist"
    ) {
      return null;
    }

    return url.searchParams.get("list");
  } catch {
    return null;
  }
}

function getLoadOptions(url) {
  if (!isYouTubeEmbedUrl(url)) {
    return undefined;
  }

  return {
    httpReferrer: {
      url: "https://www.youtube.com/",
      policy: "strict-origin-when-cross-origin"
    }
  };
}

function isYouTubeEmbedUrl(value) {
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase();
    return (
      url.protocol === "https:" &&
      (host === "youtube.com" || host.endsWith(".youtube.com")) &&
      url.pathname.startsWith("/embed")
    );
  } catch {
    return false;
  }
}
