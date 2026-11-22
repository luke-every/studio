---
name: handoff
description: Get a prototype ready for engineering. Checks its final variants against the every-website design system (components and colours) and saves the findings to Studio, where the designer decides each one and signs it off. Use when the user types /handoff, or asks to hand off a prototype, prepare it for dev or get it ready for engineering. Also use when they ask to apply a signed-off handoff.
---

# /handoff

Engineers used to build from Figma. Now they build from Test Kitchen, so the handoff has to carry what Figma
carried: which design is final, which parts are the design system, what is new, and which colours are tokens.

There are three steps, and you do the first one:

1. **Scan** (you, here): work out what is final and what each final variant renders, then run the scanner. It
   swaps exact colours for their tokens, compares every live file with the design system and saves the findings to
   the studio.
2. **Review** (the designer, in Test Kitchen): they go through every finding, mine beside the match, and decide.
3. **Ready for dev** (the designer): once everything is decided they sign it off, and the same page becomes the
   package engineering reads.

Files that came with the prototype from the team's starter, kits or templates, untouched, are not the designer's to decide: the
scan lists them for engineering (with how they differ from production's) and never puts them in the review or checks them for colours.
A kit file the designer has changed since is reviewed like any other.

The scanner is deterministic. Your part is the judgement it can't make: which variants are final, and which files each
one starts from. **Don't change any of the prototype's code during a handoff**, and never run git. The one exception is
the scanner's own: it replaces a colour class that is exactly a token (`border-[#bdb3a9]` becomes
`border-light-grey-3`) in the prototype's own files, never in files copied from production, and prints each change.

## 1. Where it goes

A handoff is made while you work on the prototype, with nothing pushed. It goes to the studio running on this machine (the scanner finds it on its usual ports) and describes the prototype's **Live** version, the one running from the folder. The prototype only has to be in `~/Claude/prototypes/`; the name is the folder's name in the studio. Don't /push first. If no studio is running, tell the designer to start it (`npm run dev` in the studio's folder).

## 2. Which variants are final

Read `public/studio.json`. The control with `"variants": true` lists the design options (`value` and `label`). Ask the
designer which of them are final, by their labels, in one question (several can be). Don't guess, and don't assume the
default is the only one.

No such control: the whole prototype is one design. Use a single variant called `main`.

## 3. Find each final variant's entry files

Find the file that switches on the variant control (search for `useControl("<control id>")`, or the control's
`param`). For each final option, read what that branch renders and list, as paths relative to the prototype folder:

- the component(s) the branch renders for that option (the fallback branch is the default option's),
- anything else rendered only for that option (a nav panel, a sticky card),
- the site chrome rendered around it (header, footer), if any.

Don't list the switching file itself: it imports every variant, so it would pull in the ones that weren't chosen.
The scanner follows imports (relative and `@/`) from these files; everything it can't reach is listed as not handed
off. If a branch renders inline JSX rather than a component, list the components that JSX uses.

Worked example (bundle-comparison, final: A, B, PDP). `ComparisonVariants.tsx` switches on `variant`:

```
a = BundleOverview (the default branch, layout="stacked") + BundleMenuRows (the nav) + HeaderV2 + Footer
b = BundleOverview (layout="swipe") + BundleMenuRows + HeaderV2 + Footer
i = BundleComparisonF + HeaderV2
```

## 4. Run the scanner

```
node ~/.claude/skills/handoff/scan.mjs \
  --dir /absolute/path/to/the/prototype \
  --name "Bundle comparison" \
  --variant a=src/components/website/comparison/BundleOverview.tsx,src/components/website/comparison/BundleMenuRows.tsx,src/components/website/HeaderV2.tsx,src/components/website/Footer.tsx \
  --variant b=... \
  --variant i=...
```

`--version v0.4` hands off a particular version (default: the newest). `--dry` only writes the file locally and asks
the studio nothing (it still fixes exact colours). `--no-fix` scans without changing any code. The author is the git `user.name` unless you pass `--by "<name>"`.

It reads the design system from GitHub with `gh` (Every-Foods/every-website, `main`, recording the commit), and from a
local clone at `~/Claude/every-website` or `~/Claude/every-website-main` only if `gh` can't. It needs the prototype's
dependencies installed (it uses its TypeScript). It prints the scope, each finding, and the link to review it.

Running it again for the same version replaces the findings and keeps the decisions already made on findings that are
still there. A handoff that has been signed off can't be replaced: push a new version.

If it stops, tell the designer in a line or two what it said, and ask what they want to do. Don't edit their code to
get past it.

## 5. Tell the designer what happens next

If it fixed anything and the version handed off isn't the working copy (Live, v0.0), say the code changed and a
/push makes the fixed version.

Two or three lines: how many findings by kind, the link it printed, and that in Test Kitchen they go through each
finding, decide (approve, use a different match, add it to the system, or ignore it),
and press **Ready for dev** when everything is decided. Their decisions save as they go.

## Applying a signed-off handoff

There is no apply command. When the designer (or an engineer) asks you to apply the handoff, fetch it:

```
node ~/.claude/skills/handoff/scan.mjs --fetch --name "Bundle comparison" [--version v0.4]
```

It writes the handoff, decisions included, to a file and prints where. That file is your instruction:

- `approve`: make the change in `proposed.summary` (for example, swap the colour for the token in `proposed.use`,
  or use the system component instead of the hand-built element at the lines in `where`).
- `pick`: the same, with `decision.candidate` instead of the proposed match.
- `add`: the component or colour becomes part of the system under `decision.name` (a component moves to
  `src/components/shared/`, a colour becomes a token). Do this only where you have been asked to change the system.
- `exception` (shown as Ignore in the review): leave it as it is; `decision.reason`, if there is one, says why.
- Stand-ins are never lifted: production's own component stays and gets the props listed in `mine.addedProps`.
- `lift` lists the TODO(lift) markers: the data and copy to wire up.
- `fixed` is done already. `exact` lists exact colours left as written: swap each for its `token` only where the
  file is the feature's own.

Apply only what was decided, and only once `signOff` is set, or when the designer asks to try the decisions made so far.
If a decision is unclear in the code, ask.

Before you change anything, copy each file you are about to change into `.studio/handoff-backup/<timestamp>/` (same
paths), so it can be put back. After the changes, run the prototype's lint and `tsc`, then run the scanner again with
`--no-fix`: the findings you applied should be gone, and the designer sees the result in the studio's Live version
(the running prototype) before anything is pushed. A /push makes it a version.

## Never

- Never change the prototype's code while scanning, beyond the scanner's own exact-colour fixes.
- Never invent entries or final variants: ask.
- Never run git.
