import { cp, mkdir } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  console.error("Usage: node scripts/copy-paths.mjs <source> <destination> [... pairs]");
  process.exit(1);
}

for (let index = 0; index < args.length; index += 2) {
  const source = args[index];
  const destination = args[index + 1];
  await mkdir(path.dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}
