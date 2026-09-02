import { createConfig } from "@valentinkolb/ssr";
import { createSSRHandler } from "@valentinkolb/ssr/hono";
import { currentDarkMode, currentTimeZone } from "../lib/request-context";
import { themeName } from "../lib/theme";

type PageOptions = {
  title?: string;
  description?: string;
};

// Opt-in dev mode: only enabled when NODE_ENV is explicitly "development", so a
// missing or misconfigured NODE_ENV falls back to production (no dev overlay).
const isDev = Bun.env.NODE_ENV === "development";

export const { config, plugin, html } = createConfig<PageOptions>({
  dev: isDev,
  verbose: false,

  template: ({ body, scripts, title, description }) => {
    /**
     * Both come out of the request context rather than being passed in: this is
     * the HTML shell, not a page, so nothing can hand it props.
     *
     * `data-theme` has to be correct in the first byte. Anything that fixed it
     * afterwards would show the light page and then the dark one, on every
     * navigation - see lib/theme.ts.
     *
     * `data-timezone` is what the script in the Layout needs to decide whether a
     * time may lose its zone suffix. Empty means the user never chose one, in
     * which case the browser's zone is the effective one and the script uses
     * that. Neither value is secret and neither decides access.
     */
    const theme = themeName(currentDarkMode());
    const timeZone = currentTimeZone() ?? "";

    return `<!DOCTYPE html>
<html lang="de" data-theme="${theme}" data-timezone="${timeZone}">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title ?? "LoRaMINT"}</title>
    <meta name="description" content="${description ?? "LoRaWAN measurement data collection service"}">
    <link rel="icon" type="image/png" sizes="32x32" href="/public/favicon.png">
    <link rel="icon" type="image/svg+xml" href="/public/favicon.svg">
    <link rel="stylesheet" href="/public/fonts.css">
    <link rel="stylesheet" href="/public/global.css">
  </head>
  <body>
    ${body}
    ${scripts}
  </body>
</html>`;
  },
});

export const ssr = createSSRHandler(html);
