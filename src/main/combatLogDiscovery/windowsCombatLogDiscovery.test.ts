import assert from "node:assert/strict";
import path from "node:path";
import test from "node:test";
import { WindowsCombatLogDiscoveryProvider } from "./windowsCombatLogDiscovery";

class MockDirent {
  constructor(
    readonly name: string,
    private readonly directory: boolean
  ) {}

  isDirectory(): boolean {
    return this.directory;
  }
}

test("discovers existing combat logs from common root candidates", async () => {
  const root = "C:\\Program Files (x86)\\World of Warcraft";
  const logPath = path.join(root, "_retail_", "Logs", "WoWCombatLog.txt");
  const checkedRoots: string[] = [];

  const provider = new WindowsCombatLogDiscoveryProvider({
    roots: [root, "C:\\Missing\\World of Warcraft"],
    fsAccess: {
      async readdir(nextPath) {
        checkedRoots.push(nextPath);
        if (nextPath === root) {
          return [
            new MockDirent("_retail_", true),
            new MockDirent("_classic_", true),
            new MockDirent("Data", true)
          ];
        }

        if (nextPath === path.join(root, "_retail_", "Logs")) {
          return [
            new MockDirent("WoWCombatLog.txt", false),
            new MockDirent("WoWCombatLog-050826_093612.txt", false),
            new MockDirent("NotCombat.txt", false)
          ];
        }

        throw new Error("missing");
      },
      async stat(nextPath) {
        if (nextPath === logPath) {
          return {
            size: 1234,
            mtime: new Date("2026-05-07T20:00:00.000Z"),
            isFile: () => true
          };
        }

        throw new Error("missing log");
      }
    }
  });

  const candidates = await provider.discover();

  assert.deepEqual(checkedRoots, [
    root,
    "C:\\Missing\\World of Warcraft",
    root,
    path.join(root, "_retail_", "Logs"),
    path.join(root, "_classic_", "Logs")
  ]);
  assert.deepEqual(candidates, [
    {
      path: logPath,
      sizeBytes: 1234,
      modifiedAt: "2026-05-07T20:00:00.000Z",
      clientFolder: "_retail_"
    }
  ]);
});

test("discovers WoW installs nested under common drive-root containers", async () => {
  const driveRoot = "D:\\";
  const installPath = path.join(driveRoot, "Battle.net", "World of Warcraft");
  const logsPath = path.join(installPath, "_retail_", "Logs");
  const logPath = path.join(logsPath, "WoWCombatLog.txt");

  const provider = new WindowsCombatLogDiscoveryProvider({
    roots: [driveRoot],
    fsAccess: {
      async readdir(nextPath) {
        if (nextPath === driveRoot) {
          return [
            new MockDirent("Battle.net", true),
            new MockDirent("Random Folder", true)
          ];
        }

        if (nextPath === path.join(driveRoot, "Battle.net")) {
          return [new MockDirent("World of Warcraft", true)];
        }

        if (nextPath === installPath) {
          return [new MockDirent("_retail_", true)];
        }

        if (nextPath === logsPath) {
          return [new MockDirent("WoWCombatLog.txt", false)];
        }

        throw new Error(`unexpected path: ${nextPath}`);
      },
      async stat(nextPath) {
        assert.equal(nextPath, logPath);
        return {
          size: 9876,
          mtime: new Date("2026-05-09T14:00:00.000Z"),
          isFile: () => true
        };
      }
    }
  });

  assert.deepEqual(await provider.discover(), [
    {
      path: logPath,
      sizeBytes: 9876,
      modifiedAt: "2026-05-09T14:00:00.000Z",
      clientFolder: "_retail_"
    }
  ]);
});

test("discovers WoW installs directly under a drive root", async () => {
  const driveRoot = "E:\\";
  const installPath = path.join(driveRoot, "World of Warcraft");
  const logsPath = path.join(installPath, "_classic_era_", "Logs");
  const logPath = path.join(logsPath, "WoWCombatLog.txt");

  const provider = new WindowsCombatLogDiscoveryProvider({
    roots: [driveRoot],
    fsAccess: {
      async readdir(nextPath) {
        if (nextPath === driveRoot) {
          return [new MockDirent("World of Warcraft", true)];
        }

        if (nextPath === installPath) {
          return [new MockDirent("_classic_era_", true)];
        }

        if (nextPath === logsPath) {
          return [new MockDirent("WoWCombatLog.txt", false)];
        }

        throw new Error(`unexpected path: ${nextPath}`);
      },
      async stat(nextPath) {
        assert.equal(nextPath, logPath);
        return {
          size: 1111,
          mtime: new Date("2026-05-09T15:00:00.000Z"),
          isFile: () => true
        };
      }
    }
  });

  assert.deepEqual(await provider.discover(), [
    {
      path: logPath,
      sizeBytes: 1111,
      modifiedAt: "2026-05-09T15:00:00.000Z",
      clientFolder: "_classic_era_"
    }
  ]);
});

test("discovers logs when a configured root points directly at the Logs folder", async () => {
  const logsPath = "C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs";
  const logPath = path.join(logsPath, "WoWCombatLog.txt");
  const timestampedLogPath = path.join(logsPath, "WoWCombatLog-050826_093612.txt");

  const provider = new WindowsCombatLogDiscoveryProvider({
    roots: [logsPath],
    fsAccess: {
      async readdir(nextPath) {
        assert.equal(nextPath, logsPath);
        return [
          new MockDirent("WoWCombatLog.txt", false),
          new MockDirent("WoWCombatLog-050826_093612.txt", false)
        ];
      },
      async stat(nextPath) {
        if (nextPath === timestampedLogPath) {
          return {
            size: 6789,
            mtime: new Date("2026-05-08T15:36:12.000Z"),
            isFile: () => true
          };
        }

        assert.equal(nextPath, logPath);
        return {
          size: 5678,
          mtime: new Date("2026-05-08T14:36:12.000Z"),
          isFile: () => true
        };
      }
    }
  });

  assert.deepEqual(await provider.discover(), [
    {
      path: timestampedLogPath,
      sizeBytes: 6789,
      modifiedAt: "2026-05-08T15:36:12.000Z",
      clientFolder: "_retail_"
    },
    {
      path: logPath,
      sizeBytes: 5678,
      modifiedAt: "2026-05-08T14:36:12.000Z",
      clientFolder: "_retail_"
    }
  ]);
});

test("deduplicates the same active log discovered through overlapping roots", async () => {
  const root = "C:\\Program Files (x86)\\World of Warcraft";
  const logsPath = path.join(root, "_retail_", "Logs");
  const logPath = path.join(logsPath, "WoWCombatLog.txt");

  const provider = new WindowsCombatLogDiscoveryProvider({
    roots: [root, logsPath],
    fsAccess: {
      async readdir(nextPath) {
        if (nextPath === root) {
          return [new MockDirent("_retail_", true)];
        }

        if (nextPath === logsPath) {
          return [new MockDirent("WoWCombatLog.txt", false)];
        }

        throw new Error("missing");
      },
      async stat(nextPath) {
        assert.equal(nextPath, logPath);
        return {
          size: 4321,
          mtime: new Date("2026-05-08T16:00:00.000Z"),
          isFile: () => true
        };
      }
    }
  });

  assert.deepEqual(await provider.discover(), [
    {
      path: logPath,
      sizeBytes: 4321,
      modifiedAt: "2026-05-08T16:00:00.000Z",
      clientFolder: "_retail_"
    }
  ]);
});
