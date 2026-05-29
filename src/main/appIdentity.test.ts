import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { appId, appName } from "./appIdentity";

const builderConfig = require(path.join(__dirname, "..", "..", "electron-builder.config.cjs")) as {
  appId?: string;
  productName?: string;
  win?: {
    executableName?: string;
  };
};
const packageJson = require(path.join(__dirname, "..", "..", "package.json")) as {
  productName?: string;
};

test("Windows package and runtime identity use the app name shown in system UI", () => {
  assert.equal(appName, "WoW Pull Playlist");
  assert.equal(appId, "com.wowpullplaylist.app");
  assert.equal(packageJson.productName, appName);
  assert.equal(builderConfig.productName, appName);
  assert.equal(builderConfig.appId, appId);
  assert.equal(builderConfig.win?.executableName, appName);
});
