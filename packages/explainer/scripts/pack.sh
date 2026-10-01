#!/usr/bin/env bash
# Build ../../exports/process-explainer-embed.zip: this package + the bundled sample code base (so the demo and tests run standalone).
set -euo pipefail
cd "$(dirname "$0")/../../.."
out="$PWD/exports"; mkdir -p "$out"; rm -f "$out/process-explainer-embed.zip"
stage="$(mktemp -d)"; trap 'rm -rf "$stage"' EXIT
mkdir "$stage/process-explainer"
tar -C packages/explainer --exclude=.data --exclude=node_modules --exclude=dist --exclude=sample-code -cf - . | tar -C "$stage/process-explainer" -xf -
mkdir "$stage/process-explainer/sample-code"
tar -C test/fixtures/bafoz --exclude='*.html' -cf - NewBusiness | tar -C "$stage/process-explainer/sample-code" -xf -
cp packages/explainer/EMBED-PROMPT.md "$out/EMBED-PROMPT.md"
(cd "$stage" && zip -qr "$out/process-explainer-embed.zip" process-explainer)
echo "Wrote $out/process-explainer-embed.zip and $out/EMBED-PROMPT.md"
