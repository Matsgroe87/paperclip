import { cp, mkdir, readdir, rm } from "node:fs/promises";

await rm("dist/migrations", { recursive: true, force: true });
await mkdir("dist/migrations/meta", { recursive: true });
for (const name of await readdir("src/migrations")) {
  if (name.endsWith(".sql")) await cp(`src/migrations/${name}`, `dist/migrations/${name}`);
}
await cp("src/migrations/meta/_journal.json", "dist/migrations/meta/_journal.json");
