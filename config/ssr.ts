import { createConfig } from "@valentinkolb/ssr";
import { createSSRHandler } from "@valentinkolb/ssr/hono";

type PageOptions = {
  title?: string;
  description?: string;
};

const isDev = Bun.env.NODE_ENV !== "production";

export const { config, plugin, html } = createConfig<PageOptions>({
  dev: isDev,
  verbose: false,

  template: ({ body, scripts, title, description }) => {
    return `<!DOCTYPE html>
<html lang="de" data-theme="corporate">
  <head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title ?? "LoRaMINT"}</title>
    <meta name="description" content="${description ?? "LoRaWAN measurement data collection service"}">
    <link rel="stylesheet" href="/public/global.css">
  </head>
  <body>
    ${body}
  </body>
  ${scripts}
</html>`;
  },
});

export const ssr = createSSRHandler(html);
