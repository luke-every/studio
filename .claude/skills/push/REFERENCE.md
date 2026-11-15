# /push: the rare cases

Read this only when `push.mjs` printed one of the messages below, stopped, or the person asked for something specific.

## No studio configured

The person hasn't run the install command yet. Tell them to open the studio, tap "Get set up", and paste the one command into Terminal.

## A specific version number

Only if the person asks ("push this as v1.0"): `--version v1.0`. It must look like `v0.8` and be one that prototype doesn't already have. Never pass it to "fix" an error.

## Links and other flags

- `--figma <url>` and `--notion <url>`: only if the person gave you those links.
- `--entry app.html` if the entry isn't `index.html`. `--project <slug>`. `--author "<name>"` (default: the git `user.name`).
- `--no-flow` drops the flow. `--no-controls` drops the previous version's studio controls (by default the ones still read by a file are carried forward).

## Messages the script prints

- **"Fixed N file path(s) that started with "/"":** the script already corrected them in the uploaded copy; their source is untouched and stays right for production. Mention it in one line only if they ask.
- **A "Heads up" about paths starting with "/":** those name no file in the site (or are built in code), so they won't load in the studio. Tell the person in one line that the fix is the framework's image component or a literal path to a file in `public/`. Don't change their code unless they ask.
- **A "Heads up" about the prototype adding the time to its own file addresses:** it makes the prototype slow to open in the studio. Tell the person in one line that the fix is to pin that value to a fixed string.
- **"Couldn't send it in one go … uploading file by file instead":** no git on this Mac, or it couldn't reach GitHub. It carries on. Not a problem.
- **"GitHub asked to slow down; waiting …":** it waits and carries on. Not a problem. If it still stops on GitHub's rate limit, nothing was saved: say to run /push again in a few minutes.

## If the script stops

Tell the person in a line or two what it said and ask what they want to do. Don't edit their code, open a browser, run builds or checks, or try another approach to get past it. Those are their decisions, and each costs minutes.
