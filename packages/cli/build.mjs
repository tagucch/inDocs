import { chmod } from "node:fs/promises";
import { build } from "esbuild";

await build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: "dist/indocs.mjs",
  banner: { js: "#!/usr/bin/env node" },
  logLevel: "info",
});
await chmod("dist/indocs.mjs", 0o755);
