import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { chmod, copyFile, mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const piPackages = [
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
];

for (const failCheck of [false, true]) {
  test(`latest-Pi script saves temporary versions and cleans up on ${failCheck ? "failure" : "success"}`, async () => {
    const fixture = await mkdtemp(join(tmpdir(), "pi-latest-check-"));
    const logPath = join(fixture, "npm-calls.jsonl");
    const manifest = JSON.stringify({
      devDependencies: Object.fromEntries(piPackages.map((name) => [name, "0.1.0"])),
      peerDependencies: Object.fromEntries(piPackages.map((name) => [name, "*"])),
    });
    const lockfile = "original lockfile\n";

    try {
      for (const directory of ["scripts", "extensions", "test", "bin"]) {
        await mkdir(join(fixture, directory));
      }
      await copyFile(
        new URL("../scripts/check-latest-pi.sh", import.meta.url),
        join(fixture, "scripts/check-latest-pi.sh"),
      );
      await writeFile(join(fixture, "package.json"), manifest);
      await writeFile(join(fixture, "package-lock.json"), lockfile);
      await writeFile(join(fixture, "tsconfig.json"), "{}");

      // Model npm's manifest validation without network access. A future Pi
      // version must differ from the fixture's baseline to catch --no-save.
      const npmPath = join(fixture, "bin/npm");
      await writeFile(npmPath, `#!/usr/bin/env node
const fs = require("node:fs");
const args = process.argv.slice(2);
const manifest = JSON.parse(fs.readFileSync("package.json", "utf8"));
const names = ${JSON.stringify(piPackages)};
const latest = "999.0.0";
fs.appendFileSync(process.env.NPM_TEST_LOG, JSON.stringify({ args, cwd: process.cwd() }) + "\\n");
if (args[0] === "install") {
  for (const name of names) {
    if (!args.includes(name + "@latest")) continue;
    fs.writeFileSync(".installed-pi-version", latest);
    if (args.includes("--save-dev") && args.includes("--save-exact")) {
      manifest.devDependencies[name] = latest;
    }
  }
  fs.writeFileSync("package.json", JSON.stringify(manifest));
} else if (args[0] === "ls") {
  const installed = fs.readFileSync(".installed-pi-version", "utf8");
  if (names.some(name => manifest.devDependencies[name] !== installed)) {
    console.error("ELSPROBLEMS: installed Pi version does not match temporary manifest");
    process.exit(1);
  }
} else if (args[0] === "run" && args[1] === "check") {
  if (names.some(name => manifest.peerDependencies[name] !== "*")) process.exit(2);
  if (process.env.NPM_TEST_FAIL_CHECK === "true") process.exit(3);
} else {
  throw new Error("Unexpected npm call: " + args.join(" "));
}
`);
      await chmod(npmPath, 0o755);

      const result = spawnSync("bash", [join(fixture, "scripts/check-latest-pi.sh")], {
        encoding: "utf8",
        env: {
          ...process.env,
          PATH: `${join(fixture, "bin")}:${process.env.PATH}`,
          NPM_TEST_LOG: logPath,
          NPM_TEST_FAIL_CHECK: String(failCheck),
        },
      });
      assert.ifError(result.error);
      assert.equal(result.status, failCheck ? 3 : 0, result.stderr);

      const calls: { args: string[]; cwd: string }[] = (await readFile(logPath, "utf8"))
        .trim().split("\n").map((line) => JSON.parse(line));
      assert.deepEqual(calls.at(-1)?.args, ["run", "check"]);
      const latestInstall = calls.find((call) => call.args.includes(`${piPackages[0]}@latest`));
      assert.ok(latestInstall);
      assert.ok(latestInstall.args.includes("--ignore-scripts"));
      assert.ok(latestInstall.args.includes("--package-lock=false"));
      assert.equal(existsSync(latestInstall.cwd), false, "temporary installation must be removed");
      assert.equal(await readFile(join(fixture, "package.json"), "utf8"), manifest);
      assert.equal(await readFile(join(fixture, "package-lock.json"), "utf8"), lockfile);
    } finally {
      await rm(fixture, { recursive: true, force: true });
    }
  });
}
