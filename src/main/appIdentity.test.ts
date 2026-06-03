import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
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

test("all app-created windows use the shared taskbar icon", () => {
  const sourceFiles = [path.join(__dirname, "..", "..", "src", "main", "main.ts")];

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const windowConstructors = source.match(/new BrowserWindow\(\{[\s\S]*?\n\s*\}\);/g) ?? [];
    assert.ok(windowConstructors.length > 0, `${sourceFile} should create at least one BrowserWindow`);

    for (const windowConstructor of windowConstructors) {
      assert.match(windowConstructor, /icon: appIconPath/, `${sourceFile} has a BrowserWindow without appIconPath`);
    }
  }
});

test("all app-created windows apply Windows taskbar app details", () => {
  const sourceFiles = [path.join(__dirname, "..", "..", "src", "main", "main.ts")];

  for (const sourceFile of sourceFiles) {
    const source = readFileSync(sourceFile, "utf8");
    const windowCount = source.match(/new BrowserWindow\(\{/g)?.length ?? 0;
    const taskbarDetailCount = source.match(/applyAppWindowIcon\(/g)?.length ?? 0;
    assert.ok(windowCount > 0, `${sourceFile} should create at least one BrowserWindow`);
    assert.equal(taskbarDetailCount, windowCount, `${sourceFile} should apply taskbar details to every window`);
  }
});

test("YouTube OAuth library does not create an embedded login window", () => {
  const sourceFile = path.join(__dirname, "..", "..", "src", "main", "playlistProviders", "youtubeLibrary.ts");
  const source = readFileSync(sourceFile, "utf8");

  assert.equal(source.includes("new BrowserWindow("), false);
});
