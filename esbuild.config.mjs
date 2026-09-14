import esbuild from "esbuild";

const production = process.argv[2] === "production";
const context = await esbuild.context({
  banner: { js: '/* Source: https://github.com/xamspanda/obsidian-tabout — AGPL-3.0 */' },
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "@codemirror/*"],
  format: "cjs",
  platform: "browser",
  target: "es2022",
  minify: production,
  sourcemap: production ? false : "inline",
  logLevel: "info",
  outfile: "main.js",
});
if (production) {
  await context.rebuild();
  await context.dispose();
} else {
  await context.watch();
}
