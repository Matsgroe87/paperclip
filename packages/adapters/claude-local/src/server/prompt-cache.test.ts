import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { prepareClaudePromptBundle } from "./prompt-cache.js";

const originalPaperclipHome = process.env.PAPERCLIP_HOME;
const originalPaperclipInstanceId = process.env.PAPERCLIP_INSTANCE_ID;

afterEach(() => {
  if (originalPaperclipHome === undefined) delete process.env.PAPERCLIP_HOME;
  else process.env.PAPERCLIP_HOME = originalPaperclipHome;
  if (originalPaperclipInstanceId === undefined) {
    delete process.env.PAPERCLIP_INSTANCE_ID;
  } else {
    process.env.PAPERCLIP_INSTANCE_ID = originalPaperclipInstanceId;
  }
});

describe("prepareClaudePromptBundle", () => {
  it("materializes selected skills as copied directories instead of symlinks", async () => {
    const root = await fs.mkdtemp(
      path.join(os.tmpdir(), "paperclip-claude-prompt-cache-"),
    );
    const skillSource = path.join(root, "source-skill");
    await fs.mkdir(skillSource, { recursive: true });
    await fs.writeFile(
      path.join(skillSource, "SKILL.md"),
      "# Test skill\n",
      "utf8",
    );
    process.env.PAPERCLIP_HOME = path.join(root, "paperclip-home");
    process.env.PAPERCLIP_INSTANCE_ID = "test";

    try {
      const bundle = await prepareClaudePromptBundle({
        companyId: "company-1",
        skills: [
          {
            key: "company/company-1/test-skill",
            runtimeName: "test-skill",
            source: skillSource,
          },
        ],
        instructionsContents: null,
        onLog: async () => {},
      });

      const materializedSkill = path.join(
        bundle.rootDir,
        ".claude",
        "skills",
        "test-skill",
      );
      const stat = await fs.lstat(materializedSkill);
      expect(stat.isDirectory()).toBe(true);
      expect(stat.isSymbolicLink()).toBe(false);
      await expect(
        fs.readFile(path.join(materializedSkill, "SKILL.md"), "utf8"),
      ).resolves.toBe("# Test skill\n");
    } finally {
      await fs.rm(root, { recursive: true, force: true });
    }
  });
});
