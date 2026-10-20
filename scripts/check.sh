#!/bin/sh
# Lint, types and build, in that order. Silent on success; on failure it prints only what failed.
run() {
  out=$("$@" 2>&1) || { echo "$out" | tail -40; echo "FAILED: $*"; exit 1; }
}
run npx eslint --quiet
run npx tsc --noEmit --pretty false
run npx next build
echo "ok: lint, types, build"
