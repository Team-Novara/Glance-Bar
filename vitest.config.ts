import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

const srcPath = resolve("./src").replace(/\\/g, "/");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Mirror the @/* path alias declared in tsconfig.app.json so
      // tests can import via the same short paths as production code.
      "@": srcPath,
    },
  },
  test: {
    environment: "jsdom",
    // Single setup file: initializes i18n, jest-dom matchers, DOM cleanup
    // between tests, and the legacy test()/assert globals that the
    // pre-vitest .test.ts files still rely on.
    setupFiles: [
      "./src/shared/test-util/setup.ts",
    ],
    // Pick up both naming conventions. The .vitest.* files use vitest's
    // native it()/expect(); the .test.* files use the legacy custom
    // test()/assert helpers provided by the setupFile above.
    include: [
      "src/**/*.vitest.{ts,tsx}",
      "src/**/*.test.{ts,tsx}",
    ],
    globals: false,
    css: false,
    coverage: {
      // The CI coverage include globs (e.g. "src/providers/**") also match
      // non-code files such as src/providers/impl/platform/README.md. For
      // included-but-untested files the v8 provider parses the source as
      // JavaScript (rollup parseAst in getCoverageMapForUncoveredFiles),
      // which logged a noisy RollupError PARSE_ERROR for the markdown.
      // Markdown can never carry coverage, so exclude it. Note: vitest's
      // coverage.exclude default is an empty list, so this replaces nothing.
      exclude: ["**/*.md"],
    },
  },
});
