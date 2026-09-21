# Prototype Studio

An internal tool for a small product design team. It is where work in progress
lives: prototypes, the question each one is trying to answer, how they evolved,
and the alternative directions people took.

Stack: Next.js (App Router) · TypeScript · Tailwind CSS · Motion for React ·
CSS-variable design tokens · Git · Vercel.

---

## Motion is currently OFF

`MOTION_ENABLED` in `src/lib/motion/config.ts` is `false`. Every state change
is instant: no route transition, no shared-element travel, no layout
animation, no enter/exit easing. Layers still mount, unmount and trap focus.

The vocabulary, tokens and primitives below all read that flag and stay in
place, so motion can be reintroduced **one interaction at a time** and judged
on its own merits. Do not flip the flag back on wholesale.

Everything below describes how motion works when it is enabled.

---

## Motion and interaction principles

Prototype Studio is a dynamic interface. Never assume a view is static.

When designing or implementing a new interaction, think:

```
CURRENT STATE  →  TRANSITION  →  DESTINATION STATE
```

and ask: **what connects these states?** Prefer continuity over replacement.

### Shared elements

When the same object exists in two states, consider whether it should visually
travel between them. Prototype preview, prototype title, version preview,
selected navigation item. Use shared layout transitions; every shared id is
declared in `src/lib/motion/layout-ids.ts`, never inline.

### Layout changes

When structure changes — grid/list, expanded/collapsed, filtering, sorting,
selection, responsive changes — animate the layout rather than snapping.

### Menus, modals and sheets

A menu must have a visible origin: it opens from the control that summoned it
and closes back into it. Modals and sheets are spatially connected to whatever
opened them. Nothing appears from nowhere.

### Navigation

No generic fade-out/fade-in between routes. Preserve visual continuity. The
user should feel they moved, not that the screen was replaced.

### Theme

A theme change is a transition between two visual states, not a colour swap.

### Restraint

Do not animate because animation is available. Motion must communicate
continuity, hierarchy, causality, state change or spatial relationship. If it
communicates none of those, remove it.

### Performance

Prefer `transform` and `opacity`. Use layout animation deliberately. Do not
animate large DOM trees at once.

### Accessibility

Always respect `prefers-reduced-motion`. Reduced motion removes movement while
preserving a clear state change — never a frozen or broken interface.

### Design quality

Never use motion to compensate for poor hierarchy. Hierarchy first; motion
reinforces the design, it does not define it.

---

## The motion vocabulary

Five registers, defined in `src/lib/motion/vocabulary.ts`. Pick by what the
change *means*:

| Register    | Use for |
| ----------- | ------- |
| `gentle`    | hover, selection, colour and theme changes |
| `normal`    | menus, popovers, navigation, list changes |
| `emphasis`  | a moment that deserves a beat — arrival, confirmation |
| `spatial`   | an object moving between contexts — card → detail, preview → focus |
| `immersive` | a change of mode — entering a prototype, entering focus mode |

Do not invent a sixth register, and do not write a bare duration or easing
value in a component. If nothing fits, question the interaction.

---

## Primitives

Reach for an existing primitive from `@/components/motion` before writing a new
animated component. The catalogue, and the reasoning behind each one, is in
`docs/motion.md`. Shared overlay behaviour (escape, scroll lock, focus trap,
focus restoration) is `useOverlayBehaviour` — never reimplemented per layer.

---

## Token discipline

- Raw values live only in `src/styles/tokens.css`.
- Semantic tokens live only in `src/styles/theme.css`.
- Motion tokens live in `src/styles/motion.css`, mirrored for JS in
  `src/lib/motion/tokens.ts`. Edit the two together.
- Components consume semantic tokens only. No hex codes, no default Tailwind
  palette (`bg-red-500` is as wrong as `#ff0000`), no magic numbers.

A future designer must be able to change theme, typography, density, corner
treatment, accent colour, timing and easing from the token layer alone,
without touching a component.

---

## Structure

Teams contain prototypes. A prototype is a name, a sentence, and a list of
versions — each version saying what changed, and keeping its own copy of the
files so older ones stay viewable.

There is no status, no tags, no context field and no separate design
question. They were metadata nobody filled in honestly, and an empty field
reads worse than no field. Do not reintroduce them without being asked.

Projects are optional folders inside a team — a view onto the team's work,
not a partition of it, so the team page always lists everything.

- `/` — recent prototypes as a quiet horizontal strip, then the teams grid.
  The strip must stay lower in the hierarchy than the teams beneath it.
- `/teams/[slug]` — the team name, a row of project folders, then every
  prototype in the team, most recently opened first.
- `/teams/[slug]/projects/[projectSlug]` — the prototypes filed into one.
- `/prototypes/[slug]` — one prototype: the thing itself, what it is, and
  its history. `?v=v0.2` opens a particular version.
- `/p/<slug>/<version>` — the prototype's own files, outside the door.

Side nav is Home, the search field, Settings, then the teams.

Grid is the default arrangement everywhere, with a grid/list switcher whose
choice is remembered per scope.

**Phone-shaped previews are for thumbnails only.** They make a grid read as
a set of screens. On the detail page a prototype gets a real frame: its own
width, its own scrolling, nothing cropped, and browser fullscreen to expand.

**Every page must stay prerendered.** Nothing in `(studio)/layout.tsx` or a
page may read a cookie, a header or `useSearchParams` — any of those opts
the page out of static generation and puts a server round trip in front of
every navigation. The door is checked in middleware for this reason, and the
version parameter is read through `useSyncExternalStore`.

---

## Data rules

Full detail in `docs/registry.md`. The rules that must not be violated when
adding features:

1. **Git owns code history.** Never recreate it. A version does not store a
   commit SHA — the commit containing the version file is the version.
2. **The registry owns design meaning**: what the prototype is, what was
   explored, what each version means, which direction is selected.
3. **Versions are immutable.** New state means a new version, never an edit
   and never a reused number.
4. **Explorations are not versions.** A direction, versus a saved state.
5. **Deployments are not versions.** Redeploying does not increment anything.
6. **Current is not latest.** The selected version is an explicit human
   choice, recorded with who and when.
7. **Never delete design history.** Archive.
8. **The Hub is not the source of truth.** Critical state never lives only in
   UI state.
9. **Keep storage replaceable.** Components talk to `src/lib/registry`.
   Only `read.ts`, `write.ts` and `github.ts` know where data lives.
10. **Keep infrastructure out of the UX.** Branches, SHAs, deployment ids
    appear only where they are genuinely useful.
11. **Per-person state stays client-side.** Recently opened, view mode,
    current user. Never in the registry.
12. **Every automation must be recoverable.** Never record a version whose
    underlying commit does not exist; report what succeeded and what failed.
13. **Prefer boring infrastructure.** Complexity is earned by a requirement.
14. **GitHub and Vercel, nothing else.** The registry is files in the repo,
    written as commits by the person making the change. No database. Do not
    introduce another service without asking.

15. **Nobody signs in.** There are no accounts and no user records. One
    shared password opens the studio; one token does the app's writing.
    Authorship comes from git commits for work pushed from Claude Code, and
    from a "Created by" field for the one flow where the app cannot know.
    Do not add authentication.
16. **Prototypes are files, not links.** Each lives at
    `public/p/<slug>/<exploration>/index.html` and is served from this
    deployment. Previews render the real thing rather than a screenshot.

Setup is in `docs/setup.md`.

## Adding a prototype from Claude Code

`/push` is the way work enters the studio — see `.claude/skills/push`. It
works out what changed, writes the version notes, runs:

```
npm run proto:add -- --file ./thing.html --name "Thing" --team acquisition \
  --title "headline" --changes "what is new" [--project slug] [--description "..."]
```

then commits and pushes. The commit is what attributes the version, which is
why the studio needs no login.

---

## Product feel

Calm, human, visual, precise, warm, tactile, intentional, responsive.

**Visual reference: Programa.design.** Neutral and quiet. Small type, thin
hairline borders, small radii, near-monochrome, generous whitespace, and the
thumbnails doing the visual work. Colour is a signal — a status dot, a state —
never decoration.

**Sans-serif only.** One family throughout. No serif display face, no mono.

Clarity, hierarchy, restraint, continuity and progressive disclosure from
Apple. Warmth, storytelling and exploration from Airbnb. Neither one's visual
styling.

It must not read as Linear, Notion, Jira, GitHub, a developer dashboard, or a
generated SaaS template. Language in the interface is written the way the team
talks — questions and reasoning, not tickets and metadata.

---

## Checks

Run before calling any stage done:

```
npm run lint
npx tsc --noEmit
npm run build
```
