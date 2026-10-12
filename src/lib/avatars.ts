/**
 * What a person looks like: a face on a colour. There are no accounts, so this
 * is not an identity, only how somebody chooses to appear; a name with nothing
 * chosen gets a face and colour worked out from the name, the same every time.
 */

export const AVATAR_COUNT = 58;

/** The colours a face can sit on, in the order of `--avatar-bg-1..5`. */
export const AVATAR_COLORS = ["Pink", "Stone", "Sage", "Mint", "Lilac"] as const;

export type Profile = {
  name: string;
  /** Which face, from 0; the picture is `public/avatars/<avatar + 1>.png`. */
  avatar: number;
  /** Which colour, from 0, in `AVATAR_COLORS`. */
  color: number;
};

export const avatarSrc = (avatar: number) => `/avatars/${avatar + 1}.png`;
export const colorVar = (color: number) => `var(--avatar-bg-${color + 1})`;

/** A number from a name, the same every time: a polynomial rolling hash, so "Luke" and "Luka" land far apart. */
function hash(name: string) {
  let h = 7;
  for (const char of name.toLowerCase()) h = (h * 31 + char.charCodeAt(0)) % 360_007;
  return h;
}

/** What somebody looks like until they choose: a face and colour from their name. */
export function defaultProfile(name: string): Profile {
  const h = hash(name);
  return { name, avatar: h % AVATAR_COUNT, color: Math.floor(h / AVATAR_COUNT) % AVATAR_COLORS.length };
}

/** A face and colour at random, for somebody being added. */
export function randomProfile(name = ""): Profile {
  return {
    name,
    avatar: Math.floor(Math.random() * AVATAR_COUNT),
    color: Math.floor(Math.random() * AVATAR_COLORS.length),
  };
}
