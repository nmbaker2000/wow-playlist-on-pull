import assert from "node:assert/strict";
import test from "node:test";
import { listPlaylistProviders } from "./index";

test("provider registry lists available playback providers", () => {
  assert.deepEqual(listPlaylistProviders(), [
    { id: "youtube", label: "YouTube" },
    { id: "local", label: "Local Media" }
  ]);
});
