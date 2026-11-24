import { mkdtemp, readFile, rm } from "node:fs/promises";
import { createServer } from "node:net";
import os from "node:os";
import path from "node:path";
import EmbeddedPostgres from "embedded-postgres";
import postgres from "postgres";
import { expect, it } from "vitest";
import { prepareEmbeddedPostgresNativeRuntime } from "./embedded-postgres-native.js";

it("preserves profile assignments when the renumbered fork migration is replayed", async () => {
  const root = path.resolve(os.tmpdir());
  const directory = await mkdtemp(path.join(root, "paperclip-profile-migration-"));
  const server = createServer();
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as { port: number }).port;
  await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  await prepareEmbeddedPostgresNativeRuntime();
  const instance = new EmbeddedPostgres({ databaseDir: directory, user: "paperclip", password: "paperclip",
    port, persistent: true, onLog: () => {}, onError: () => {} });
  let sql: ReturnType<typeof postgres> | undefined;
  try {
    await instance.initialise();
    await instance.start();
    sql = postgres(`postgres://paperclip:paperclip@127.0.0.1:${port}/postgres`, { max: 1 });
    await sql.unsafe('CREATE TABLE companies (id uuid PRIMARY KEY); CREATE TABLE agents (id uuid PRIMARY KEY, company_id uuid);');
    const migration = await readFile(new URL("./migrations/0505_runtime_profiles.sql", import.meta.url), "utf8");
    await sql.unsafe(migration);
    const [company] = await sql`INSERT INTO companies VALUES (gen_random_uuid()) RETURNING id`;
    const [profile] = await sql`INSERT INTO runtime_profiles (company_id, name, adapter_type)
      VALUES (${company.id}, 'Existing local profile', 'claude_local') RETURNING id`;
    const [agent] = await sql`INSERT INTO agents (id, company_id, runtime_profile_id) VALUES (gen_random_uuid(), ${company.id}, ${profile.id}) RETURNING id`;
    await sql.unsafe(migration);
    expect(await sql`SELECT runtime_profile_id FROM agents WHERE id=${agent.id}`).toMatchObject([{ runtime_profile_id: profile.id }]);
    expect(await sql`SELECT name FROM runtime_profiles WHERE id=${profile.id}`).toMatchObject([{ name: "Existing local profile" }]);
  } finally {
    await sql?.end();
    await instance.stop();
    if (!directory.startsWith(root + path.sep) || !path.basename(directory).startsWith("paperclip-profile-migration-"))
      throw new Error("Unexpected migration test directory");
    await rm(directory, { recursive: true, force: true });
  }
}, 30_000);
