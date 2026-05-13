import path from "node:path";
import type { PlaylistInput, PlaylistProvider } from "./types";

export class LocalMediaPlaylistProvider implements PlaylistProvider {
  readonly id = "local";
  readonly label = "Local Media";
  readonly supportsShuffle = true;

  buildPlaybackUrl(input: PlaylistInput): string {
    const localMedia = input.localMedia ?? { filePaths: [], folderPaths: [] };
    const filePaths = localMedia.filePaths.map(normalizeKeyPath).filter(Boolean);
    const folderPaths = localMedia.folderPaths.map(normalizeKeyPath).filter(Boolean);

    if (filePaths.length === 0 && folderPaths.length === 0) {
      throw new Error("Select at least one local audio file or folder.");
    }

    return `local-media:${JSON.stringify({ filePaths, folderPaths })}`;
  }
}

function normalizeKeyPath(value: string): string {
  return path.resolve(value.trim()).normalize();
}
