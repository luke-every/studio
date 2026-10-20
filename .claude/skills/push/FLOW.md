# The flow of a prototype

Work this out on every push, by yourself. The studio draws a
prototype's screens on a canvas, with an arrow for each tap. You derive that
from the code each time, so it always matches this version; there is nothing
for the person to keep or edit. Don't ask them about it.

Does the prototype have more than one screen a person moves between by tapping
(quiz steps, pages, a checkout, states you can reach)? If not, there is no flow:
carry on. If so, write one. **Don't skip it because it needs a small code
change.** Save it as a scratch file outside the prototype folder (your scratchpad
directory) and upload it with `--flow` (step 3 of SKILL.md).

The file:

```json
{
  "screens": [
    { "id": "home", "name": "Homepage", "params": {} },
    { "id": "q1", "name": "Question 1", "params": { "step": "0" } }
  ],
  "edges": [{ "from": "home", "to": "q1", "label": "Find your routine" }]
}
```

- A screen is one thing a person sees. Give each step of a multi-step flow its
  own screen, named the way the team would ("Goal, affirmed"), not by code.
- `params` are URL parameters that open the prototype on that screen. If it
  already reads some (its `controls` in `studio.json`, or its link parsing), use
  those. If it can't open a particular step, add the smallest thing that does —
  read `?step=` (or `?screen=`) when it loads and jump there with sample data
  filled in — and tell the person you did. That is in the prototype's own source,
  so do it **before the build**.
- One edge per tap that leads to another screen, labelled with the tap
  ("Continue", "Pick a plan"). Main paths only; skip back buttons and dismisses.
- The first screen is where a person starts. Past about 25 screens, don't draw
  it: leave the flow out and say why.

The script merges the file into the uploaded `studio.json` beside any controls,
so there is nothing to copy into the build. It checks the flow before uploading:
an arrow to a screen that doesn't exist, or a duplicate id, stops the push (fix
the file and re-run); a "Heads up" that nothing in the files reads a screen's
parameter means that screen would open on the first one, so add the `?step=`
handling, rebuild and push again.

The upload prints a final line, `Flow: N screens` or `Flow: none`. Put that in
your closing message so it is clear what happened. If it says none and the
prototype has several screens, you missed this step: fix it and push again.
