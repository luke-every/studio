import { THEME_STORAGE_KEY } from "./constants";

/**
 * Runs before first paint to stamp the resolved theme onto <html>, so the
 * product never flashes the wrong colours. It is intentionally tiny and
 * dependency-free; everything else about theming lives in ThemeProvider.
 */
const script = `(function(){try{
var k=${JSON.stringify(THEME_STORAGE_KEY)};
var p=localStorage.getItem(k)||"system";
var r=p==="system"?(window.matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light"):p;
var e=document.documentElement;
e.dataset.theme=r;
e.dataset.themePreference=p;
e.style.colorScheme=r;
}catch(_){}})();`;

export function ThemeScript() {
  return <script dangerouslySetInnerHTML={{ __html: script }} suppressHydrationWarning />;
}
