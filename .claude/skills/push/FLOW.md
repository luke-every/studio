# The flow of a prototype

The studio draws a multi-screen prototype's screens on a canvas, with an arrow
per tap. **The script carries the previous version's flow forward by itself**
(`Flow: N screens (carried over from v1.2)`), so do nothing here unless:

- this is the first push of a prototype with several screens a person taps
  between, or
- this session added, removed or renamed a screen, or changed what leads where.

A single screen has no flow. Don't ask the person about any of this.

Then write a scratch file outside the prototype folder and pass it with `--flow`
(it replaces the carried one). `--no-flow` drops the flow instead.

```json
{
  "screens": [
    { "id": "home", "name": "Homepage", "params": {} },
    { "id": "q1", "name": "Question 1", "params": { "step": "0" } }
  ],
  "edges": [{ "from": "home", "to": "q1", "label": "Find your routine" }]
}
```

- A screen is one thing a person sees, named the way the team would
  ("Goal, affirmed"). The first is where a person starts. Past about 25, leave
  the flow out.
- `params` are URL parameters that open the prototype on that screen. Use ones it
  already reads. Only for a new flow, if it can't open a step, add the smallest
  `?step=` handling in its source **before the build** and say so.
- One edge per tap to another screen, labelled with the tap. Main paths only.

The script validates the flow: a bad arrow or duplicate id stops the push (fix
the file, re-run); a "Heads up" that nothing reads a parameter means that screen
opens on the first one. Put the final `Flow:` line in your closing message. If
it says none and the prototype has several screens, write one and push again.

## Controls

A prototype with switchable states, variants or scenarios exposes them as studio
controls in `public/studio.json` (the folder's `studio.json` for plain folders).
**Edit that file, never replace it**: it also holds the flow. Controls are not
carried over from an earlier version, so each version's file says what it offers.

```json
{ "controls": [
  { "id": "state", "label": "State", "type": "choice", "default": "a",
    "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }] },
  { "id": "dark", "label": "Dark mode", "type": "toggle" },
  { "id": "step", "label": "Step", "type": "range", "min": 0, "max": 5, "default": 0 }
] }
```

Optional on any control: `param` (the URL parameter, default the id) and
`when: { "control": "state", "is": "b" }` (only offered while that holds). The
prototype reads `?<param>=` (or the starter's `useControl` helper, if it has
one). A `range` may also have `step` (default 1).

If the prototype has its own in-page switcher bar and no controls, ask the
person ONE short question whether to move those into studio controls, and do it
only if they say yes.

The script validates controls (unique ids, `when` pointing at a real control, a
choice's default among its options with at least two, a range's min below max
with its default between). A problem stops the push; fix it and re-run. A
"Heads up" that nothing reads `?x=` means that control does nothing.
