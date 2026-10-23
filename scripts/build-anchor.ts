/**
 * Builds `public/studio-anchor.js` from `src/lib/anchor.ts`: the studio's description of where a comment is, for the
 * phone's comment script (`public/studio-review.js`), which runs inside a prototype's own page and can't import it.
 * Run before `next dev` and `next build`, so the two never differ.
 */
import { build } from "esbuild";

build({
  stdin: {
    contents: 'import { anchorAt, stateOf } from "@/lib/anchor"; (window as any).__studioAnchor = { anchorAt, stateOf };',
    resolveDir: process.cwd(),
    loader: "ts",
  },
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  tsconfig: "tsconfig.json",
  outfile: "public/studio-anchor.js",
  banner: { js: "/* Built from src/lib/anchor.ts by scripts/build-anchor.ts. Don't edit; it is not checked in. */" },
  logLevel: "warning",
}).catch(() => process.exit(1));
