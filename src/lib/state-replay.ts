/**
 * A state of a screen is the screen plus the steps that reach it: load the page, press this, then this. A step names its element by the selector
 * `selectorFor` gave it as it was pressed, so replaying it in a fresh copy of the page gives the same state, from the page as it is now.
 */
export type Step = { click: string };

const wait = (ms: number) => new Promise<void>((done) => setTimeout(done, ms));

/** What was pressed: the control around whatever was hit (the icon inside a button is not what a page listens to), or the element itself. */
export const pressedOf = (target: Element) => target.closest('button, a[href], summary, label, input, select, textarea, [role="button"], [role="tab"], [role="menuitem"], [role="option"], [role="switch"], [role="checkbox"], [role="radio"], [tabindex]') ?? target;

/** Waits until the page has stopped changing (a modal's transition is done), but never longer than `most`. Says whether it changed at all while it waited. */
function settle(doc: Document, quiet = 350, most = 3000) {
  return new Promise<boolean>((done) => {
    let finished = false;
    let changed = false;
    let timer = 0;
    const finish = () => {
      if (finished) return;
      finished = true;
      observer.disconnect();
      clearTimeout(timer);
      clearTimeout(limit);
      done(changed);
    };
    const observer = new MutationObserver(() => {
      changed = true;
      clearTimeout(timer);
      timer = window.setTimeout(finish, quiet);
    });
    const limit = window.setTimeout(finish, most);
    timer = window.setTimeout(finish, quiet);
    observer.observe(doc, { subtree: true, childList: true, attributes: true, characterData: true });
  });
}

/** A press as a person makes it, the whole sequence: a menu opens on the pointer going down, a button on the click, and a page may listen for either. */
function press(element: Element) {
  const win = element.ownerDocument.defaultView;
  if (!win) return;
  const box = element.getBoundingClientRect();
  const init = { bubbles: true, cancelable: true, composed: true, view: win, button: 0, clientX: box.left + box.width / 2, clientY: box.top + box.height / 2 };
  const pointer = (type: string, buttons: number) => new win.PointerEvent(type, { ...init, buttons, pointerId: 1, pointerType: "mouse", isPrimary: true });
  const mouse = (type: string, buttons: number) => new win.MouseEvent(type, { ...init, buttons });
  element.dispatchEvent(pointer("pointerdown", 1));
  element.dispatchEvent(mouse("mousedown", 1));
  (element as HTMLElement).focus?.({ preventScroll: true });
  element.dispatchEvent(pointer("pointerup", 0));
  element.dispatchEvent(mouse("mouseup", 0));
  element.dispatchEvent(mouse("click", 0));
}

/** How many times a press that changed nothing is made again before it is taken to have done what it does. */
const PRESSES = 3;

/**
 * Plays the steps into a loaded page, one after another. The page is let to finish loading first (a press that lands before the framework has hooked up its handlers
 * does nothing), each element is waited for, and a press that changed nothing on the page is made again after a moment, so one that came too early isn't lost.
 * Stops where an element can't be found (the page has changed since), leaving the state as far as it got, and says whether it reached the end.
 */
export async function replaySteps(frame: HTMLIFrameElement, steps: Step[]) {
  // A screen on the canvas is inert, which a press from here doesn't care about; lifted anyway, so nothing depends on that.
  const inert = frame.inert;
  if (inert) frame.inert = false;
  try {
    if (frame.contentDocument) await settle(frame.contentDocument, 600, 5000);
    for (const step of steps) {
      let target: Element | null = null;
      for (let tries = 0; tries < 27 && !target; tries++) {
        try {
          target = frame.contentDocument?.querySelector(step.click) ?? null;
        } catch {
          return false;
        }
        if (!target) await wait(150);
      }
      if (!target) {
        console.warn("[studio] A kept state couldn't find what it presses:", step.click);
        return false;
      }
      for (let press_ = 0; press_ < PRESSES; press_++) {
        const doc = frame.contentDocument;
        const now = doc ? frame.contentDocument?.querySelector(step.click) : null;
        if (!doc || !now) break;
        const watching = settle(doc);
        press(now);
        if (await watching) break;
        await wait(600);
      }
    }
    return true;
  } finally {
    if (inert) frame.inert = true;
  }
}
