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
