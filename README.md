# Activity Viewport for Pi

Activity Viewport is a TypeScript extension for [Pi](https://github.com/earendil-works/pi-mono) that keeps active work visible without allowing thinking, tool calls, and status output to overwhelm the conversation transcript.

It replaces each turn's expanding activity stream with a bounded, scrollable viewport while leaving completed assistant responses in Pi's normal transcript.

## What it does

- Groups assistant thinking, tool calls, intermediate text, and live status by user turn.
- Displays the latest activity in a fixed 10-row inline viewport.
- Keeps final assistant responses in the durable transcript.
- Preserves a historical view when new activity arrives and reports unseen lines.
- Opens a larger overlay for reviewing long activity streams.
- Restores Pi's native transcript when disabled or when a compatible layout cannot be patched safely.
- Bounds activity rendering and caching to avoid unbounded memory or rendering costs.

Activity histories longer than 2,000 rendered lines are truncated with a visible marker.

## Requirements

- Pi with TUI mode
- Node.js 22.19.0 or newer for development

The extension operates on Pi's TUI component layout and is not available in RPC, JSON, or print mode.

## Installation

Clone the repository and install the checkout as a local Pi package:

```bash
git clone https://github.com/pauljacobson/pi-activity-viewport.git
cd pi-activity-viewport
pi install "$PWD"
```

Restart Pi after installation. When developing or updating an already loaded checkout, use Pi's `/reload` command.

### Symlink installation

The extension can also be linked directly into Pi's global extension directory:

```bash
mkdir -p ~/.pi/agent/extensions
ln -s "$PWD/extensions/activity-viewport" \
  ~/.pi/agent/extensions/activity-viewport
```

Project-local installation is also possible by linking the directory under `.pi/extensions/` in a trusted project.

## Usage

The viewport is enabled automatically when the extension loads successfully.

### Command

```text
/activity-viewport [on|off|status|expand|up|down|latest]
```

| Action | Effect |
| --- | --- |
| `on` | Enable and install the viewport. |
| `off` | Disable it and restore the native transcript. |
| `status` | Report whether the viewport is enabled and installed. |
| `expand` | Open the expanded activity overlay. |
| `up` | Scroll the inline viewport toward older activity. |
| `down` | Scroll the inline viewport toward newer activity. |
| `latest` | Return the inline viewport to the newest activity. |

`open`, `enable`, `disable`, `back`, `forward`, and `end` are accepted aliases.

### Shortcut

Press `Ctrl+Shift+O` to open the expanded activity overlay.

### Overlay navigation

The overlay honors Pi's configured selection keybindings and also supports:

| Keys | Effect |
| --- | --- |
| `↑` / `↓` or `k` / `j` | Scroll one line. |
| `Page Up` / `Page Down` or `Ctrl+U` / `Ctrl+D` | Scroll one page. |
| `g` or `Home` | Jump to the oldest activity. |
| `G` or `End` | Jump to the latest activity. |
| `Esc`, `q`, or `m` | Close the overlay. |

## How it works

The extension installs a small probe widget during `session_start`, then uses that probe to locate Pi's transcript and status containers structurally. It patches their rendering seams while retaining the original property descriptors so the native UI can be restored cleanly.

The implementation is divided into focused modules:

- `extensions/activity-viewport/index.ts` — extension lifecycle, command, shortcut, and installation.
- `extensions/activity-viewport/activity-viewport.ts` — activity grouping, bounded rendering, navigation, and caching.
- `extensions/activity-viewport/activity-overlay.ts` — expanded overlay and keyboard navigation.
- `extensions/activity-viewport/assistant-projection.ts` — separates transient assistant activity from durable responses while preserving Pi's native rendering behavior.
- `extensions/activity-viewport/pi-compat.ts` — detects compatible Pi layouts and safely applies or removes the render patch.

## Compatibility and fallback behavior

Activity Viewport depends on internal Pi transcript component structure that is not part of Pi's public extension API. Compatibility is therefore tested explicitly:

- The normal suite tests the pinned Pi development versions.
- `npm run check:latest-pi` creates a temporary environment and tests against the latest Pi packages published to npm.
- GitHub Actions runs locked-version checks on pushes and pull requests, plus scheduled latest-Pi checks.
- Dependabot checks npm dependencies weekly.

If Pi's layout is not recognized, the extension warns and leaves the native interface untouched. If viewport rendering fails after installation, it falls back to Pi's native chat and status renderers rather than hiding transcript content.

## Development

Install the locked development dependencies:

```bash
npm ci
```

Run type checking and tests:

```bash
npm run check
```

Other useful commands:

```bash
npm run typecheck         # TypeScript validation only
npm test                  # Test suite only
npm run check:latest-pi   # Test against the latest published Pi packages
npm audit                 # Check dependency vulnerabilities
npm outdated              # Review available dependency updates
```

The three Pi development dependencies are updated and tested as one compatibility set. Their runtime counterparts remain peer dependencies because Pi provides them when loading the package.

## Project status

This package is currently marked `private` and is intended to be installed from a local or Git checkout rather than published to npm.
