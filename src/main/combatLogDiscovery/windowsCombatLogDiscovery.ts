import path from "node:path";
import { promises as fsPromises } from "node:fs";
import type { CombatLogCandidate, CombatLogDiscoveryProvider } from "./types";

interface FileSystemAccess {
  readdir(path: string, options: { withFileTypes: true }): Promise<Array<{ name: string; isDirectory(): boolean }>>;
  stat(path: string): Promise<{ size: number; mtime: Date; isFile(): boolean }>;
}

export interface WindowsCombatLogDiscoveryOptions {
  roots?: string[];
  fsAccess?: FileSystemAccess;
}

const DEFAULT_WINDOWS_ROOTS = [
  "C:\\",
  "C:\\Program Files (x86)\\World of Warcraft",
  "C:\\Program Files\\World of Warcraft",
  "C:\\Program Files (x86)\\World of Warcraft\\_retail_\\Logs",
  "C:\\Program Files\\World of Warcraft\\_retail_\\Logs",
  "C:\\Games\\World of Warcraft",
  "C:\\Games\\World of Warcraft\\_retail_\\Logs",
  "D:\\",
  "D:\\World of Warcraft",
  "D:\\World of Warcraft\\_retail_\\Logs",
  "D:\\Games\\World of Warcraft",
  "D:\\Games\\World of Warcraft\\_retail_\\Logs",
  "E:\\",
  "F:\\"
];

const CLIENT_FOLDER_PATTERN = /^_(retail|classic|classic_era|ptr|beta)_$/i;
const COMBAT_LOG_PATTERN = /^WoWCombatLog(?:-\d{6}_\d{6})?\.txt$/i;
const INSTALL_FOLDER_PATTERN = /^World of Warcraft$/i;
const INSTALL_CONTAINER_PATTERN = /^(Games|Battle\.?net|Blizzard|Blizzard Games|Program Files|Program Files \(x86\))$/i;

export class WindowsCombatLogDiscoveryProvider implements CombatLogDiscoveryProvider {
  private readonly roots: string[];
  private readonly fsAccess: FileSystemAccess;

  constructor(options: WindowsCombatLogDiscoveryOptions = {}) {
    this.roots = options.roots ?? DEFAULT_WINDOWS_ROOTS;
    this.fsAccess = options.fsAccess ?? fsPromises;
  }

  async discover(): Promise<CombatLogCandidate[]> {
    const candidates = await Promise.all(this.roots.map((root) => this.discoverRoot(root)));
    return dedupeCandidatesByPath(candidates.flat())
      .sort((left, right) => right.modifiedAt.localeCompare(left.modifiedAt));
  }

  private async discoverRoot(root: string): Promise<CombatLogCandidate[]> {
    if (path.basename(root).toLocaleLowerCase() === "logs") {
      return this.discoverLogsFolder(root, path.basename(path.dirname(root)));
    }

    const installFolders = await this.discoverInstallFolders(root);
    if (installFolders.length === 0) {
      return [];
    }

    const candidatesByInstall = await Promise.all(
      installFolders.map((installFolder) => this.discoverInstallFolder(installFolder))
    );

    return candidatesByInstall.flat();
  }

  private async discoverInstallFolders(root: string): Promise<string[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;

    try {
      entries = await this.fsAccess.readdir(root, { withFileTypes: true });
    } catch {
      return [];
    }

    const hasClientFolders = entries.some((entry) => entry.isDirectory() && CLIENT_FOLDER_PATTERN.test(entry.name));
    const installFolders = hasClientFolders ? [root] : [];

    const directInstallFolders = entries
      .filter((entry) => entry.isDirectory() && INSTALL_FOLDER_PATTERN.test(entry.name))
      .map((entry) => path.join(root, entry.name));
    installFolders.push(...directInstallFolders);

    const containerFolders = entries
      .filter((entry) => entry.isDirectory() && INSTALL_CONTAINER_PATTERN.test(entry.name))
      .map((entry) => path.join(root, entry.name));
    const nestedInstallFolders = await Promise.all(
      containerFolders.map((containerFolder) => this.discoverNestedInstallFolders(containerFolder))
    );

    installFolders.push(...nestedInstallFolders.flat());
    return dedupePaths(installFolders);
  }

  private async discoverNestedInstallFolders(containerFolder: string): Promise<string[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;

    try {
      entries = await this.fsAccess.readdir(containerFolder, { withFileTypes: true });
    } catch {
      return [];
    }

    return entries
      .filter((entry) => entry.isDirectory() && INSTALL_FOLDER_PATTERN.test(entry.name))
      .map((entry) => path.join(containerFolder, entry.name));
  }

  private async discoverInstallFolder(installFolder: string): Promise<CombatLogCandidate[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;

    try {
      entries = await this.fsAccess.readdir(installFolder, { withFileTypes: true });
    } catch {
      return [];
    }

    const clientFolders = entries
      .filter((entry) => entry.isDirectory() && CLIENT_FOLDER_PATTERN.test(entry.name))
      .map((entry) => entry.name);

    const candidatesByClient = await Promise.all(
      clientFolders.map((clientFolder) => this.buildCandidate(installFolder, clientFolder))
    );

    return candidatesByClient.flat();
  }

  private async buildCandidate(
    root: string,
    clientFolder: string
  ): Promise<CombatLogCandidate[]> {
    return this.discoverLogsFolder(path.join(root, clientFolder, "Logs"), clientFolder);
  }

  private async discoverLogsFolder(logsPath: string, clientFolder: string): Promise<CombatLogCandidate[]> {
    let entries: Array<{ name: string; isDirectory(): boolean }>;

    try {
      entries = await this.fsAccess.readdir(logsPath, { withFileTypes: true });
    } catch {
      return [];
    }

    const candidates = await Promise.all(
      entries
        .filter((entry) => !entry.isDirectory() && COMBAT_LOG_PATTERN.test(entry.name))
        .map((entry) => this.buildLogCandidate(path.join(logsPath, entry.name), clientFolder))
    );

    return candidates.filter((candidate): candidate is CombatLogCandidate => candidate !== null);
  }

  private async buildLogCandidate(logPath: string, clientFolder: string): Promise<CombatLogCandidate | null> {
    try {
      const stats = await this.fsAccess.stat(logPath);
      if (!stats.isFile()) {
        return null;
      }

      return {
        path: logPath,
        sizeBytes: stats.size,
        modifiedAt: stats.mtime.toISOString(),
        clientFolder
      };
    } catch {
      return null;
    }
  }
}

function dedupePaths(paths: string[]): string[] {
  const uniquePaths = new Map<string, string>();

  for (const candidatePath of paths) {
    uniquePaths.set(path.normalize(candidatePath).toLocaleLowerCase(), candidatePath);
  }

  return [...uniquePaths.values()];
}

function dedupeCandidatesByPath(candidates: CombatLogCandidate[]): CombatLogCandidate[] {
  const uniqueCandidates = new Map<string, CombatLogCandidate>();

  for (const candidate of candidates) {
    const normalizedPath = path.normalize(candidate.path).toLocaleLowerCase();
    const existingCandidate = uniqueCandidates.get(normalizedPath);
    if (!existingCandidate || candidate.modifiedAt > existingCandidate.modifiedAt) {
      uniqueCandidates.set(normalizedPath, candidate);
    }
  }

  return [...uniqueCandidates.values()];
}
