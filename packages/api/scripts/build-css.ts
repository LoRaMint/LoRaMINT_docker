import tailwind from "bun-plugin-tailwind";

await Bun.build({
  entrypoints: ["frontend/styles/global.css"],
  outdir: "public",
  plugins: [tailwind],
});
