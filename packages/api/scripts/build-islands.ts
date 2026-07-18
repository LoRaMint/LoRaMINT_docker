// Bundles the browser "islands" to public/<name>.js (loaded as ES modules).
// Plotly is not imported here; it is self-hosted separately in
// public/vendor/plotly.min.js and referenced globally by the /plots page.
const islands = [
  { entry: "frontend/pages/plots/client.ts", name: "plots" },
  { entry: "frontend/pages/export/client.ts", name: "export" },
];

for (const { entry, name } of islands) {
  await Bun.build({
    entrypoints: [entry],
    outdir: "public",
    naming: `${name}.[ext]`,
    minify: true,
    target: "browser",
  });
}
