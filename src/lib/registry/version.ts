/** "v0.8", or "v0.8.1" for a small edit made on top of it. */
export const VERSION_PATTERN = /^v\d+\.\d+(?:\.\d+)?$/;

/** Where a version's files are stored and served: dots become dashes, so a dot never needs escaping. */
export function versionSegment(version: string) {
  return version.replace(/\./g, "-");
}
