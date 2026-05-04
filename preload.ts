import { plugin } from "./config/ssr";
import tailwind from "bun-plugin-tailwind";

Bun.plugin(plugin());

await Bun.build({
  entrypoints: ["frontend/styles/global.css"],
  outdir: "public",
  plugins: [tailwind],
});
