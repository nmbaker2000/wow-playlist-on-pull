const shouldSignWindows = Boolean(process.env.CSC_LINK || process.env.WINDOWS_SIGNING_ENABLED === "true");

/** @type {import("electron-builder").Configuration} */
module.exports = {
  appId: "com.wowpullplaylist.app",
  productName: "WoW Pull Playlist",
  directories: {
    output: "release"
  },
  files: [
    "dist/**/*",
    "package.json"
  ],
  win: {
    target: [
      {
        target: "nsis",
        arch: ["x64"]
      }
    ],
    artifactName: "${productName}-Setup-${version}-${arch}.${ext}",
    signAndEditExecutable: shouldSignWindows
  },
  nsis: {
    oneClick: false,
    perMachine: false,
    allowElevation: true,
    allowToChangeInstallationDirectory: true,
    createDesktopShortcut: true,
    createStartMenuShortcut: true,
    shortcutName: "WoW Pull Playlist"
  }
};
