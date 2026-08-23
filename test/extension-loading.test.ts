import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import test from "node:test";

import { discoverAndLoadExtensions } from "@earendil-works/pi-coding-agent";

test("Pi discovers and loads the extension through a directory symlink", async () => {
  const temporaryAgentDir = await mkdtemp(join(tmpdir(), "pi-activity-viewport-"));
  const extensionsDir = join(temporaryAgentDir, "extensions");
  await mkdir(extensionsDir);
  await symlink(
    resolve("extensions/activity-viewport"),
    join(extensionsDir, "activity-viewport"),
    "dir",
  );

  try {
    const result = await discoverAndLoadExtensions([], process.cwd(), temporaryAgentDir);
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions.length, 1);

    const extension = result.extensions[0]!;
    assert.ok(extension.commands.has("activity-viewport"));
    assert.ok(extension.shortcuts.has("ctrl+shift+o"));
  } finally {
    await rm(temporaryAgentDir, { recursive: true, force: true });
  }
});
