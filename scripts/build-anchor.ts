/**
 * Builds the studio's comment code for pages it doesn't draw itself, so the two never differ from the studio's own:
 *
 *  - `public/studio-anchor.js` from `src/lib/anchor.ts`: the studio's description of where a comment is, for the
 *    phone's comment script (`public/studio-review.js`), which runs inside a prototype's own page and can't import it.
 *  - `public/studio-comments.js` from `src/lib/comment-bridge.ts`: comments on a live version, which runs on its own
 *    dev server where the studio can't look in (see `src/components/prototype/frame-page.ts`).
 *
 * Run before `next dev` and `next build`. Neither file is checked in.
 */
import { build, type BuildOptions } from "esbuild";

const common: BuildOptions = {
  bundle: true,
  format: "iife",
  minify: true,
  target: "es2020",
  tsconfig: "tsconfig.json",
  logLevel: "warning",
};

Promise.all([
  build({
    ...common,
    stdin: {
      contents: 'import { anchorAt, stateOf, watchTaps } from "@/lib/anchor"; (window as any).__studioAnchor = { anchorAt, stateOf, watchTaps };',
      resolveDir: process.cwd(),
      loader: "ts",
    },
    outfile: "public/studio-anchor.js",
    banner: { js: "/* Built from src/lib/anchor.ts by scripts/build-anchor.ts. Don't edit; it is not checked in. */" },
  }),
  build({
    ...common,
    entryPoints: ["src/lib/comment-bridge.ts"],
    outfile: "public/studio-comments.js",
    banner: { js: "/* Built from src/lib/comment-bridge.ts by scripts/build-anchor.ts. Don't edit; it is not checked in. */" },
  }),
]).catch(() => process.exit(1));
