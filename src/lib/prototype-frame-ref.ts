/**
 * The frame the prototype is shown in, and a question put to it: which lines of its copy file is the page showing now. A prototype on its own address (a running
 * dev server) can't be read from the studio, so it is asked with a message and answers with the numbers of the lines it puts out (see `studio-copy.ts` in the
 * starter). A page that doesn't answer (an older prototype, or a built version, whose copy carries no tags) gives null.
 */
let frame: HTMLIFrameElement | null = null;

export const setPrototypeFrame = (element: HTMLIFrameElement | null) => {
  frame = element;
};

export function readSeenLines(): Promise<number[] | null> {
  const page = frame?.contentWindow;
  if (!page) return Promise.resolve(null);
  return new Promise((resolve) => {
    const id = crypto.randomUUID();
    const done = (lines: number[] | null) => {
      window.removeEventListener("message", on);
      window.clearTimeout(timer);
      resolve(lines);
    };
    const on = (event: MessageEvent) => {
      const data = event.data as { type?: string; id?: string; lines?: unknown } | null;
      if (event.source !== page || data?.type !== "studio:copy-seen:answer" || data.id !== id || !Array.isArray(data.lines)) return;
      done(data.lines.filter((line): line is number => Number.isInteger(line)));
    };
    const timer = window.setTimeout(() => done(null), 1500);
    window.addEventListener("message", on);
    page.postMessage({ type: "studio:copy-seen", id }, "*");
  });
}
