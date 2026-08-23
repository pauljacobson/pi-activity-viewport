# Repository instructions

## Project scope

This repository contains a TypeScript package for the Pi extension in `extensions/activity-viewport/`. Preserve its behavior as a Pi package and follow the current Pi extension and package APIs.

The Pi packages in `peerDependencies` are runtime-provided peers. Keep their ranges compatible with Pi package installation (`"*"` unless current Pi package guidance changes). The exact versions in `devDependencies` are the reproducible local compatibility baseline.

## Pi compatibility

- Before changing extension behavior or Pi-facing types, consult the documentation and relevant examples for the current published `@earendil-works/pi-coding-agent` release. Do not rely only on remembered APIs or on an older globally installed copy.
- Treat `@earendil-works/pi-ai`, `@earendil-works/pi-coding-agent`, and `@earendil-works/pi-tui` as one Pi compatibility set. Update and test them together.
- Do not claim compatibility with the current Pi release unless `npm run check:latest-pi` passes. This command tests in a temporary directory against the latest versions published to npm without modifying the working tree.
- For every change to extension code, tests, `package.json`, `package-lock.json`, or Pi-facing configuration, run:
  1. `npm run check`
  2. `npm run check:latest-pi`
- If the latest Pi release breaks the extension, adapt the implementation and tests to the supported current API. Do not hide the incompatibility by weakening tests, pinning the latest-release check to an older version, or adding unsafe type assertions.
- Preserve `.github/workflows/compatibility.yml`, including its scheduled latest-Pi job, unless replacing it with equally strong or stronger coverage.

## Dependency maintenance and security

- Before changing dependencies and before preparing a release, run `npm outdated` and `npm audit`.
- Keep direct dependencies current. Update the three Pi development dependencies together and commit the corresponding `package-lock.json` changes.
- Review Dependabot updates promptly. Preserve the weekly npm configuration in `.github/dependabot.yml` unless replacing it with an equivalent or more frequent process.
- Address reported vulnerabilities promptly with the smallest supported upgrade that resolves them, then rerun `npm audit`, `npm run check`, and `npm run check:latest-pi`.
- Do not ignore or suppress an advisory merely to obtain a clean result. If no safe fix exists, report the affected package, severity, exposure in this extension, available mitigations, and the follow-up needed.
- Do not run `npm audit fix --force`, accept a breaking major upgrade, or add an audit exception without explicit user approval and validation of the resulting behavior.

## General validation

- Use `npm ci` when validating from the committed lockfile.
- Add or update focused tests for behavior changes and regressions.
- Report the exact checks run, the Pi versions exercised, and any unresolved compatibility, outdated dependency, or vulnerability findings.
