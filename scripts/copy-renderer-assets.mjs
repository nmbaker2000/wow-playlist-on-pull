import { mkdir, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(root, "..");

const assets = [
  ["src/renderer/index.html", "dist/renderer/index.html"],
  ["src/renderer/localPlayer.html", "dist/renderer/localPlayer.html"],
  ["src/renderer/styles.css", "dist/renderer/styles.css"]
];

await mkdir(join(projectRoot, "dist", "renderer"), { recursive: true });

for (const [from, to] of assets) {
  await copyFile(join(projectRoot, from), join(projectRoot, to));
}
