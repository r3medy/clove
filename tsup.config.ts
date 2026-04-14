import { defineConfig } from "tsup";

export default defineConfig([
  // Main entry
  {
    entry: { index: "src/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    outDir: "dist",
  },
  // React entry
  {
    entry: { "react/index": "src/react/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    outDir: "dist",
    external: ["react"],
  },
  // Plugins entry
  {
    entry: { "plugins/index": "src/plugins/index.ts" },
    format: ["esm", "cjs"],
    dts: true,
    sourcemap: true,
    splitting: false,
    treeshake: true,
    outDir: "dist",
  },
]);
