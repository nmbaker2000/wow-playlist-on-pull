import { spawn } from "node:child_process";
import { rename } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const allowedTargets = new Set(["dist", "release"]);
const targets = process.argv.slice(2);

if (targets.length === 0) {
  throw new Error("Pass at least one build output directory to clean.");
}

for (const target of targets) {
  const normalizedTarget = target.replaceAll("\\", "/");

  if (!allowedTargets.has(normalizedTarget)) {
    throw new Error(`Refusing to clean unsupported target: ${target}`);
  }

  const targetPath = path.join(projectRoot, normalizedTarget);
  const cleanupPath = path.join(
    projectRoot,
    `.build-cleanup-${normalizedTarget}-${Date.now()}-${process.pid}`
  );

  try {
    await rename(targetPath, cleanupPath);
  } catch (error) {
    if (error?.code === "ENOENT") {
      continue;
    }

    throw error;
  }

  const cleanupScript = [
    "import { rm } from 'node:fs/promises';",
    `await rm(${JSON.stringify(cleanupPath)}, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });`
  ].join("\n");

  const cleanup = spawn(process.execPath, ["--input-type=module", "-e", cleanupScript], {
    detached: true,
    stdio: "ignore"
  });

  cleanup.unref();
}
