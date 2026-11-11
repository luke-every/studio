import { Welcome } from "@/components/welcome/welcome";
import { getPrototypes } from "@/lib/registry";
import { latestPictures } from "@/lib/registry/select";

/**
 * The welcome, to look at from inside the studio. `/unlock` sends anyone
 * already in straight on, so this is the way to see the door without a
 * private window. It works the same: the password still opens the studio.
 */
export default async function SplashPage() {
  return <Welcome next="/" pictures={latestPictures(15, await getPrototypes())} />;
}
