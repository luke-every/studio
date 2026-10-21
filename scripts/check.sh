#!/bin/sh
# Lint, types and build, in that order. Silent on success; on failure it prints only what failed.
run() {
  out=$("$@" 2>&1) || { echo "$out" | tail -40; echo "FAILED: $*"; exit 1; }
}
# Next writes the route types (PageProps, LayoutProps) that tsc needs; a fresh clone has none until this runs.
run npx next typegen
run npx eslint --quiet
run npx tsc --noEmit --pretty false
run npx next build
echo "ok: lint, types, build"
