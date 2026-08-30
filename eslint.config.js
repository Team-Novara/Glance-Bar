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

      // FSD directory boundaries (STRUCTURE_REFACTOR_PLAN.md §3).
      // `eslint-plugin-boundaries` is not yet installed; we use the
      // already-present `eslint-plugin-import` zone rule as the gate.
      // NOTE: escalate from "warn" to "error" once violations are cleared (plan §9).
      "import/no-restricted-paths": [
        "warn",
        {
          zones: [
            // features -> entities, shared, providers ONLY (NEVER runtime directly)
            {
              target: "src/features",
              from: "src",
              except: ["src/features", "src/entities", "src/shared", "src/providers"],
            },
            // providers -> entities, shared, runtime
            {
              target: "src/providers",
              from: "src",
              except: ["src/providers", "src/entities", "src/shared", "src/runtime"],
            },
            // runtime -> entities, shared ONLY (NEVER features, NEVER providers)
            {
              target: "src/runtime",
              from: "src",
              except: ["src/runtime", "src/entities", "src/shared"],
            },
            // entities -> import nothing inside src
            {
              target: "src/entities",
              from: "src",
              except: ["src/entities"],
            },
            // shared -> import nothing inside src
            {
              target: "src/shared",
              from: "src",
              except: ["src/shared"],
            },
            // state -> entities, shared ONLY
            {
              target: "src/state",
              from: "src",
              except: ["src/state", "src/entities", "src/shared"],
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
);
