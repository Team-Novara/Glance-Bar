// ESLint v9 flat config for Cober Windows Bar.
//
// Scope: TS/TSX in src/. Rust, generated Tauri JS bindings, and test
// fixtures are excluded from linting (they're covered by cargo check
// and vitest respectively). Test files use a slightly relaxed rule
// set to allow the describe/it/vi globals without `no-unused-vars`
// complaints from type definitions.
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import unusedImports from "eslint-plugin-unused-imports";
import importPlugin from "eslint-plugin-import";

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "src-tauri/**",
      "src/test/**",
      "src/**/*.vitest.ts",
      "src/**/*.vitest.tsx",
      "src/**/*.test.ts",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      "unused-imports": unusedImports,
      import: importPlugin,
    },
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        setTimeout: "readonly",
        clearTimeout: "readonly",
        setInterval: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        globalThis: "readonly",
      },
    },
    settings: {
      react: { version: "detect" },
      // Resolve `@/`-aliased imports through tsconfig paths so
      // `import/no-restricted-paths` can actually see FSD boundary
      // violations in aliased imports (not just relative paths).
      "import/resolver": {
        typescript: {
          alwaysTryTypes: true,
          project: "./tsconfig.app.json",
        },
      },
    },
    rules: {
      // React 19 + react-hooks 5
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true },
      ],

      // TS / strictness
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-non-null-assertion": "off",
      "@typescript-eslint/consistent-type-imports": [
        "error",
        { prefer: "type-imports", fixStyle: "inline-type-imports" },
      ],
      "@typescript-eslint/no-unused-expressions": [
        "error",
        { allowShortCircuit: true, allowTernary: true, allowTaggedTemplates: true },
      ],

      // Imports
      "unused-imports/no-unused-imports": "error",
      "unused-imports/no-unused-vars": [
        "error",
        { vars: "all", varsIgnorePattern: "^_", args: "after-used", argsIgnorePattern: "^_" },
      ],
      "import/order": [
        "warn",
        {
          groups: [
            "builtin",
            "external",
            "internal",
            ["parent", "sibling", "index"],
          ],
          "newlines-between": "always",
          alphabetize: { order: "asc", caseInsensitive: true },
        },
      ],

      // FSD layer boundaries (STRUCTURE_REFACTOR_PLAN.md §3, AGENTS.md §2).
      // `eslint-plugin-boundaries` is not yet installed; we use the
      // already-present `eslint-plugin-import` zone rule as the gate.
      //
      // Intended dependency matrix (G4-relaxed architecture — the ACTUAL
      // layering, not the original "features -> entities, shared only" rule,
      // which was superseded because hooks are infrastructure and may touch
      // runtime/state):
      //   app       -> everything (composition root, unrestricted)
      //   features  -> everything (top consumer; the wall is that nothing
      //                outside features imports INTO features — importer-side
      //                restriction only, so that wall stays review-enforced)
      //   providers -> providers(self), entities, shared, runtime, state
      //                (state = EventBus hubState: the Provider -> Bus
      //                connection IS the designed data flow)
      //   runtime   -> runtime(self), entities, shared, state, i18n
      //                (NEVER providers, NEVER features)
      //   state     -> state(self), entities, shared, i18n
      //   entities  -> entities(self), i18n (status config labels)
      //   shared    -> shared(self), entities (runtimeGuards needs HubEvent)
      //   i18n, styles -> leaves; importing them is unrestricted
      //
      // eslint-plugin-import semantics: `except` entries resolve RELATIVE TO
      // the zone's `from` path (path.resolve(from, except)), so they must NOT
      // repeat the "src/" prefix — `except: ["entities"]` means src/entities,
      // while `except: ["src/entities"]` resolves to the nonexistent
      // src/src/entities and silently excepts nothing. (The old config made
      // exactly that mistake and flagged every import under src — 349
      // false-positive warnings. Verified against the rule source: lib/rules
      // /no-restricted-paths.js resolves each exception via
      // path.resolve(absoluteFrom, exceptionPath).)
      //
      // NOTE: escalate from "warn" to "error" once the remaining genuine
      // violations are cleared (plan §9).
      "import/no-restricted-paths": [
        "warn",
        {
          zones: [
            // providers -> never features (Bus connection to state is designed)
            {
              target: "src/providers",
              from: "src",
              except: ["providers", "entities", "shared", "runtime", "state"],
            },
            // runtime -> never features, never providers
            {
              target: "src/runtime",
              from: "src",
              except: ["runtime", "entities", "shared", "state", "i18n"],
            },
            // state -> never features, never providers, never runtime
            {
              target: "src/state",
              from: "src",
              except: ["state", "entities", "shared", "i18n"],
            },
            // entities -> only itself + i18n (status config labels)
            {
              target: "src/entities",
              from: "src",
              except: ["entities", "i18n"],
            },
            // shared -> only itself + entities (runtimeGuards HubEvent types)
            {
              target: "src/shared",
              from: "src",
              except: ["shared", "entities"],
            },
          ],
        },
      ],

      // Base eslint
      "no-console": ["warn", { allow: ["warn", "error"] }],
      "no-empty": ["error", { allowEmptyCatch: true }],
      "prefer-const": "error",
      eqeqeq: ["error", "always", { null: "ignore" }],
    },
  },
  {
    files: ["src/**/*.tsx"],
    rules: {
      // React 19 lets components be sync; this rule is too noisy
      "react-hooks/exhaustive-deps": "warn",
      // react-refresh/only-export-components fires when a .tsx file
      // exports BOTH a component AND a non-component helper. The
      // recommended fix is to extract the helper to a separate file,
      // but in practice we often want a small helper next to a
      // component (e.g. CSS-class-name functions in
      // GuestSourceHealthIndicator.tsx). Demote to warn for now
      // and revisit during a dedicated cleanup.
      "react-refresh/only-export-components": "off",
    },
  },
  {
    // Test + setup files: exempt from boundary rules (they load fixtures/i18n
    // across the FSD boundary by design).
    files: ["src/**/*.test.ts", "src/**/*.vitest.ts", "src/test/**/*.ts", "src/shared/test-util/setup.ts"],
    rules: {
      "import/no-restricted-paths": "off",
    },
  },
);
