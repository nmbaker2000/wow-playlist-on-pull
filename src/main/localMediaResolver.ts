import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import type { LocalMediaSelection } from "./playlistProviders";

const MAX_LOCAL_MEDIA_TRACKS = 1_000;
const MAX_LOCAL_MEDIA_SCAN_ENTRIES = 50_000;

export const SUPPORTED_LOCAL_MEDIA_EXTENSIONS = new Set([
  ".mp3",
  ".wav",
  ".flac",
  ".m4a",
  ".aac",
  ".ogg",
  ".oga",
  ".opus",
  ".webm"
]);

export interface LocalMediaTrack {
  title: string;
  originalPath: string;
  fileUrl: string;
}

export async function resolveLocalMediaTracks(selection: LocalMediaSelection): Promise<LocalMediaTrack[]> {
  const seen = new Set<string>();
  const tracks: LocalMediaTrack[] = [];

  for (const filePath of selection.filePaths) {
    const track = await resolvePlayableFile(filePath).catch(() => null);
    if (track) {
      addTrack(track, seen, tracks);
    }
  }

  for (const folderPath of selection.folderPaths) {
    const remainingTrackSlots = MAX_LOCAL_MEDIA_TRACKS - tracks.length;
    if (remainingTrackSlots <= 0) {
      break;
    }

    const folderFiles = await collectFolderMediaFiles(folderPath, remainingTrackSlots);
    for (const filePath of folderFiles) {
      const track = await resolvePlayableFile(filePath).catch(() => null);
      if (track) {
        addTrack(track, seen, tracks);
      }

      if (tracks.length >= MAX_LOCAL_MEDIA_TRACKS) {
        break;
      }
    }

    if (tracks.length >= MAX_LOCAL_MEDIA_TRACKS) {
      break;
    }
  }

  if (tracks.length === 0) {
    throw new Error("No playable local audio files were found. Select supported audio files or folders.");
  }

  return tracks;
}

export async function collectFolderMediaFiles(
  folderPath: string,
  maxFiles = MAX_LOCAL_MEDIA_TRACKS
): Promise<string[]> {
  const resolvedFolderPath = path.resolve(folderPath);
  const files: string[] = [];
  const folders = [resolvedFolderPath];
  let scannedEntries = 0;

  while (folders.length > 0 && files.length < maxFiles) {
    const currentFolder = folders.pop();
    if (!currentFolder) {
      break;
    }

    const entries = await readdir(currentFolder, { withFileTypes: true }).catch(() => []);
    entries.sort((left, right) => left.name.localeCompare(right.name));

    for (const entry of entries) {
      scannedEntries += 1;
      if (scannedEntries > MAX_LOCAL_MEDIA_SCAN_ENTRIES) {
        throw new Error(
          "Local media folder scan is too large. Pick a smaller music folder or select specific audio files."
        );
      }

      const entryPath = path.join(currentFolder, entry.name);
      if (entry.isDirectory()) {
        folders.push(entryPath);
      } else if (entry.isFile() && isSupportedLocalMediaPath(entryPath)) {
        files.push(entryPath);
        if (files.length >= maxFiles) {
          break;
        }
      }
    }
  }

  return files.sort((left, right) => left.localeCompare(right));
}

export function normalizeLocalMediaSelection(selection: LocalMediaSelection): LocalMediaSelection {
  return {
    filePaths: dedupePaths(selection.filePaths),
    folderPaths: dedupePaths(selection.folderPaths)
  };
}

export function isSupportedLocalMediaPath(filePath: string): boolean {
  return SUPPORTED_LOCAL_MEDIA_EXTENSIONS.has(path.extname(filePath).toLocaleLowerCase());
}

async function resolvePlayableFile(filePath: string): Promise<LocalMediaTrack | null> {
  const resolvedPath = path.resolve(filePath);
  if (!isSupportedLocalMediaPath(resolvedPath)) {
    return null;
  }

  const stats = await stat(resolvedPath);
  if (!stats.isFile()) {
    return null;
  }

  return {
    title: path.basename(resolvedPath, path.extname(resolvedPath)),
    originalPath: resolvedPath,
    fileUrl: pathToFileURL(resolvedPath).toString()
  };
}

function addTrack(track: LocalMediaTrack, seen: Set<string>, tracks: LocalMediaTrack[]): void {
  const key = normalizePathKey(track.originalPath);
  if (seen.has(key)) {
    return;
  }

  seen.add(key);
  tracks.push(track);
}

function dedupePaths(paths: string[]): string[] {
  const seen = new Set<string>();
  const normalizedPaths: string[] = [];

  for (const item of paths) {
    const normalizedPath = path.resolve(item.trim()).normalize();
    const key = normalizePathKey(normalizedPath);
    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    normalizedPaths.push(normalizedPath);
  }

  return normalizedPaths;
}

function normalizePathKey(filePath: string): string {
  const normalized = path.resolve(filePath).normalize();
  return process.platform === "win32" ? normalized.toLocaleLowerCase() : normalized;
}
