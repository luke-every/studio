/**
 * Asks for a prototype's page as a preview (a canvas screen, a tile): no video or audio, and storage of its own (see the
 * /p route). Its value changes whenever what a preview is does, since a page is cached for good under its address.
 * Its own file so a tile doesn't load the control schemas (and zod) just to build an address.
 */
export const PREVIEW_QUERY = "preview=2";
