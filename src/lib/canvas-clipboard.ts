/**
 * The picture a fill row last put on the clipboard (by the name it is kept under, and the size of the PNG that was copied): when that picture comes back
 * in a paste, the same one is used again rather than a second copy of it being stored.
 */
export const copiedFill: { name: string | null; size: number } = { name: null, size: 0 };
