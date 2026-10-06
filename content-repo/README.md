# The content repository's own files

`prototype-studio-content` holds prototypes (`p/<slug>/<version>/…`) and the
registry (`registry.json`). Nothing in it is deployed. These files are the only
ones that live there on purpose, and they are kept here so they are reviewed and
versioned with the studio:

- `.github/workflows/preview.yml` and `.github/scripts/preview.mjs` — after a
  push that touches `p/`, take a phone-sized picture of every version that
  doesn't have one (`studio-preview.jpg`, beside its files) and commit it. The
  studio's tiles show that picture. Anything it couldn't render is retried on
  the next run; run it by hand from the Actions tab to backfill.

To install or update: copy `.github/` into the root of the content repository.
