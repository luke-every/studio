# Prototype Studio

An internal tool for a small product design team. It is where work in progress
lives: prototypes, the question each one is trying to answer, how they evolved,
and the alternative directions people took.

Stack: Next.js (App Router) · TypeScript · Tailwind CSS · Motion for React ·
CSS-variable design tokens · Git · Vercel.

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

## Product feel

Calm, human, visual, precise, warm, tactile, intentional, responsive.

Clarity, hierarchy, restraint, continuity and progressive disclosure from
Apple. Warmth, storytelling, exploration and authored content from Airbnb.
Neither one's visual styling.

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
