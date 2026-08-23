#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
temp_dir=$(mktemp -d)
trap 'rm -rf "$temp_dir"' EXIT

cp "$repo_root/package.json" "$repo_root/tsconfig.json" "$temp_dir/"
cp -R "$repo_root/extensions" "$repo_root/test" "$temp_dir/"

cd "$temp_dir"

# Install the normal toolchain first, then replace only the Pi packages with
# their latest published versions. No lockfile or working-tree file is changed.
npm install --ignore-scripts --package-lock=false
npm install --ignore-scripts --package-lock=false --no-save \
  @earendil-works/pi-ai@latest \
  @earendil-works/pi-coding-agent@latest \
  @earendil-works/pi-tui@latest

printf '\nTesting against:\n'
npm ls \
  @earendil-works/pi-ai \
  @earendil-works/pi-coding-agent \
  @earendil-works/pi-tui \
  --depth=0

npm run check
