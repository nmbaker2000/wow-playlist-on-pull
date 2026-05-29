import assert from "node:assert/strict";
import test from "node:test";
import { applyPlaybackVolumeToWebContents, createPlaybackVolumeScript } from "./playerVolume";

test("volume script updates local player API and standard media elements", () => {
  const script = createPlaybackVolumeScript(0.25);

  assert.match(script, /localMediaPlayer/);
  assert.match(script, /setVolume/);
  assert.match(script, /querySelectorAll\("video, audio"\)/);
  assert.match(script, /0.25/);
});

test("volume helper normalizes volume before applying it", async () => {
  let executedScript = "";
  const webContents = {
    executeJavaScript(script: string) {
      executedScript = script;
      return Promise.resolve();
    }
  };

  await applyPlaybackVolumeToWebContents(webContents, 2);

  assert.match(executedScript, /const volume = 1;/);
});
