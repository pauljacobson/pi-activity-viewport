import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

test("Pi retains the private transcript layout contract used by the viewport adapter", async () => {
  const piEntryPoint = fileURLToPath(import.meta.resolve("@earendil-works/pi-coding-agent"));
  const interactiveModePath = join(
    dirname(piEntryPoint),
    "modes/interactive/interactive-mode.js",
  );
  const source = await readFile(interactiveModePath, "utf8");

  assert.match(
    source,
    /this\.documentContainer\.addChild\(this\.headerContainer\);\s*this\.documentContainer\.addChild\(this\.loadedResourcesContainer\);\s*this\.documentContainer\.addChild\(this\.chatContainer\);/,
    "Review pi-compat.ts: Pi changed the document/chat nesting",
  );
  assert.match(
    source,
    /this\.mountInteractiveTui\(this\.renderer,\s*\[\s*this\.documentContainer,\s*this\.pendingMessagesContainer,\s*this\.statusContainer,\s*this\.widgetContainerAbove,\s*this\.editorContainer,\s*this\.widgetContainerBelow,\s*this\.footerContainer,\s*\]\);/,
    "Review pi-compat.ts: Pi changed the root component order used to locate chat and status",
  );
});
