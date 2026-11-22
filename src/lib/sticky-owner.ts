const KEY = "proto:sticky-owner";
let remembered = "";

/**
 * This browser's secret id for the sticky notes it leaves through a share link. It is only ever sent to the studio, which keeps a hash of it on
 * each note; with storage blocked it lasts as long as the page.
 */
export function stickyOwner() {
  try {
    const kept = localStorage.getItem(KEY);
    if (kept) return kept;
    remembered ||= crypto.randomUUID();
    localStorage.setItem(KEY, remembered);
    return remembered;
  } catch {
    remembered ||= crypto.randomUUID();
    return remembered;
  }
}
