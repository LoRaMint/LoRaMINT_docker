/**
 * Which daisyUI theme a page is rendered with.
 *
 * The theme has to be right in the very first byte of HTML. `data-theme` sits on
 * the `<html>` element, so anything that corrects it afterwards - a script, a
 * class toggle, a second stylesheet - shows the light page first and the dark one
 * a moment later, on every single navigation. That flash is the entire reason
 * this is decided on the server.
 *
 * Hence the cookie. It is **not signed**, unlike the session, and that is fine:
 * it decides colours. The worst somebody can do by editing it is give themselves
 * a dark page. Everything the signature protects - who you are, what you may do -
 * stays in the session cookie and is never read from here.
 *
 * It is also read for visitors who are not signed in, which the session cannot
 * be. Most pages of this application are public, and a preference that only
 * worked behind a login would be missing exactly where it is most visible.
 */

export const THEME_COOKIE = "loramint_theme";

/** The names as `frontend/styles/global.css` declares them. */
export const THEMES = { light: "loramint", dark: "loramint-dark" } as const;

/** What goes in the cookie. Words rather than 0/1, so the value is legible. */
export type ThemeChoice = "light" | "dark";

export const themeCookieValue = (dark: boolean): ThemeChoice =>
  dark ? "dark" : "light";

/**
 * Reads the cookie. Anything that is not one of the two words is treated as no
 * choice at all rather than as light, because "never chose" and "chose light"
 * are different states: the first may later follow the system, the second is an
 * instruction.
 */
export const readThemeCookie = (value: string | undefined): boolean | null =>
  value === "dark" ? true : value === "light" ? false : null;

/** The `data-theme` value for the HTML shell. No choice means light. */
export const themeName = (dark: boolean | null | undefined): string =>
  dark === true ? THEMES.dark : THEMES.light;
