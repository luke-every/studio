/**
 * Shared-element identity.
 *
 * Shared layout transitions are a first-class concept in Prototype Studio: the
 * thing you click *becomes* the thing you land on. That only works if both
 * sides agree on an id, so every shared element is named here rather than
 * having ids built inline at call sites.
 */
export const layoutId = {
  projectThumbnail: (slug: string) => `project-thumbnail:${slug}`,
  projectTitle: (slug: string) => `project-title:${slug}`,
  prototypePreview: (slug: string) => `prototype-preview:${slug}`,
  prototypeTitle: (slug: string) => `prototype-title:${slug}`,
  prototypeMeta: (slug: string) => `prototype-meta:${slug}`,
  versionPreview: (slug: string, version: string) => `version-preview:${slug}:${version}`,
  versionTitle: (slug: string, version: string) => `version-title:${slug}:${version}`,
  navIndicator: "nav-indicator",
  viewModeIndicator: "view-mode-indicator",
} as const;
