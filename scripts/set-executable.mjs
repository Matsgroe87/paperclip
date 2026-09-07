import { chmod } from "node:fs/promises";
import process from "node:process";

const target = process.argv[2];
if (!target) {
  console.error("Usage: node scripts/set-executable.mjs <path>");
  process.exit(1);
}

if (process.platform !== "win32") {
  await chmod(target, 0o755);
}
