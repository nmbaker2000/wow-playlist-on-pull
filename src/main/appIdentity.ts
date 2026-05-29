import type { BrowserWindow } from "electron";
import path from "node:path";

export const appName = "WoW Pull Playlist";
export const appId = "com.wowpullplaylist.app";

export function getAppIconPath(
  platform: NodeJS.Platform = process.platform,
  projectRoot: string = path.join(__dirname, "..", "..")
): string {
  return path.join(projectRoot, "build", platform === "win32" ? "icon.ico" : "icon.png");
}

export const appIconPath = getAppIconPath();

export function applyAppWindowIcon(
  window: BrowserWindow,
  platform: NodeJS.Platform = process.platform,
  relaunchCommand: string = process.execPath
): void {
  if (platform !== "darwin") {
    window.setIcon(appIconPath);
  }

  if (platform === "win32") {
    window.setAppDetails({
      appId,
      appIconPath,
      relaunchCommand,
      relaunchDisplayName: appName
    });
  }
}
