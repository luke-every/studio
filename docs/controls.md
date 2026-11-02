# Prototype controls

A prototype opts in with a `studio.json` beside its `index.html` (each version
carries its own). The studio shows the controls beside the prototype and turns
each choice into a URL parameter. Format (`src/lib/controls.ts`):

```json
{ "controls": [
  { "type": "choice", "id": "theme", "label": "Theme", "default": "light",
    "options": [{ "value": "light", "label": "Light" }, { "value": "dark", "label": "Dark" }] },
  { "type": "toggle", "id": "empty", "label": "Empty state", "value": "1", "default": false },
  { "type": "range", "id": "cols", "label": "Columns", "min": 1, "max": 6, "step": 1, "default": 3 },
  { "type": "multi", "id": "tags", "label": "Tags", "default": ["a"],
    "options": [{ "value": "a", "label": "A" }, { "value": "b", "label": "B" }] }
] }
```

- Every control: `id`, `label`, optional `param` (the URL parameter, default the
  id) and `when: { control, is }` (only offered while another control has that value).
- `choice`: `options` (at least two) and `default`; `variants: true` marks the
  control whose options the variants canvas lays out side by side.
- `toggle`: `value` is what the parameter is set to while on (default `"1"`).
- `range`: a slider; the value travels as a string (`"42"`). `step` defaults to 1.
- `multi`: any number of `options` on at once (chips you tap on and off); `default` is the list of values on to
  start with. The parameter is the chosen values joined by commas, in option order (`"a,b"`), so a value must not
  contain a comma. Choosing none sets the parameter to an empty string, which is different from absent (the default).
- A control at its default adds nothing; so does a hidden one (`when` unmet).

## Embedded: `studio=1`

Every iframe the studio makes of a prototype (detail page, shared link,
variants and flow canvases) has `studio=1` on its address, even with all
controls at default, so the prototype can hide its own switcher. Thumbnails
do not get it.

## Live changes

1. The prototype posts `{ type: "studio:ready" }` to `window.parent` when it mounts.
2. The studio, for a message from the frame on screen only, then posts
   `{ type: "studio:controls", params: { [param]: value } }` to it, at once and
   after every change. `params` is exactly the query the address would have:
   non-default, visible controls only; absent means default. The target origin
   is the frame's own, not `*`.
3. From then on the frame is not reloaded when a control changes.

Fallback: until `studio:ready` arrives (or if it never does, for a prototype
without the helper), a changed control changes the iframe address and it
reloads. Changing version or variant, and opening a canvas, also start over from
reloading until the next `studio:ready`.

## The prototype's place: keep it in the address

A prototype keeps where it is in its own address. When the person moves to
another screen or answers something, it writes that with
`history.replaceState`, using the same parameters its controls and flow
screens use (`?start=results&bundle=protein&challenges=time,decide`). Keep the
path as it is (`location.pathname`; the page has a `<base href>`) and leave keys
it doesn't own, like `studio=1`, where they are.

The address is then the one place that says what is on screen. Reloading, a new
tab and a phone's QR code open that place, and the studio follows it: each time
the prototype writes another address, the controls show what it says, and a
comment is left on that setup (`?comment=` and the comments list put the
prototype back there). A change the prototype made itself is not posted back to
it as `studio:controls`.

A prototype that doesn't do this still works; the studio only knows the place it
put the prototype in, so a comment left after clicking through to somewhere else
can't be taken back there.
