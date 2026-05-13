import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { collectFolderMediaFiles, resolveLocalMediaTracks } from "./localMediaResolver";

async function createTempLibrary(): Promise<string> {
  return mkdtemp(path.join(tmpdir(), "local-media-"));
}

test("local media resolver accepts supported extensions", async () => {
  const root = await createTempLibrary();
  const track = path.join(root, "pull.mp3");
  await writeFile(track, "audio");

  const tracks = await resolveLocalMediaTracks({ filePaths: [track], folderPaths: [] });
  assert.equal(tracks.length, 1);
  assert.equal(tracks[0].originalPath, track);
  assert.equal(tracks[0].fileUrl.startsWith("file:"), true);
});

test("local media resolver ignores unsupported extensions", async () => {
  const root = await createTempLibrary();
  const notes = path.join(root, "notes.txt");
  await writeFile(notes, "not audio");

  await assert.rejects(
    () => resolveLocalMediaTracks({ filePaths: [notes], folderPaths: [] }),
    /No playable local audio files/
  );
});

test("local media resolver recursively scans folders", async () => {
  const root = await createTempLibrary();
  const nested = path.join(root, "artist", "album");
  await mkdir(nested, { recursive: true });
  const track = path.join(nested, "boss.wav");
  await writeFile(track, "audio");

  const tracks = await resolveLocalMediaTracks({ filePaths: [], folderPaths: [root] });
  assert.deepEqual(tracks.map((item) => item.originalPath), [track]);
});

test("local media resolver deduplicates duplicate file and folder overlap", async () => {
  const root = await createTempLibrary();
  const track = path.join(root, "same.flac");
  await writeFile(track, "audio");

  const tracks = await resolveLocalMediaTracks({ filePaths: [track], folderPaths: [root] });
  assert.deepEqual(tracks.map((item) => item.originalPath), [track]);
});

test("local media folder scan returns stable sorted order", async () => {
  const root = await createTempLibrary();
  const b = path.join(root, "b.ogg");
  const a = path.join(root, "a.ogg");
  await writeFile(b, "audio");
  await writeFile(a, "audio");

  assert.deepEqual(await collectFolderMediaFiles(root), [a, b]);
});

test("local media folder scan caps large queues", async () => {
  const root = await createTempLibrary();

  await Promise.all(
    Array.from({ length: 1005 }, (_value, index) =>
      writeFile(path.join(root, `${String(index).padStart(4, "0")}.mp3`), "audio")
    )
  );

  const tracks = await resolveLocalMediaTracks({ filePaths: [], folderPaths: [root] });
  assert.equal(tracks.length, 1000);
});
