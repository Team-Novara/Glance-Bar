/**
 * Vitest global setup — initializes i18n, jest-dom matchers, and
 * auto-cleanup between tests.
 */
import { cleanup } from "@testing-library/react";
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import { afterEach, it, expect } from "vitest";

import "@testing-library/jest-dom/vitest";
import en from "../../i18n/en.json";
import zhCN from "../../i18n/zh-CN.json";

// Standalone i18n init (no LanguageDetector) — English by default for assertions.
i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    "zh-CN": { translation: zhCN },
  },
  lng: "en",
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

// Ensure the DOM is torn down between tests so render() doesn't accumulate.
afterEach(() => {
  cleanup();
});

// ── Legacy *.test.ts globals ────────────────────────────────────────
//
// The 14 (now ~34) legacy `.test.ts` files predate vitest. They use a bare
// `test(name, run)` helper and a node:assert-style `assert` object rather
// than vitest's it()/expect(). Rewriting every case is out of scope for the
// directory collapse, so this setupFile installs the same globals that the
// now-deleted `src/test/legacy-test-shim.ts` previously provided:
//   - `test()` delegates to vitest's tracked `it()` (and logs `ok ${name}`
//     so the QA grep hooks in `npm run test:state` still fire).
//   - `assert` wraps vitest's `expect()` so legacy `assert.equal`/`deepEqual`
//     /`throws`/etc. keep working unmodified.
// Once every legacy file migrates to native it()/expect(), delete this block.
declare global {
   
  var test: (name: string, run: () => void) => void;
   
  var assert: {
    equal: (actual: unknown, expected: unknown, message?: string) => void;
    notEqual: (actual: unknown, expected: unknown, message?: string) => void;
    deepEqual: (actual: unknown, expected: unknown, message?: string) => void;
    notDeepEqual: (actual: unknown, expected: unknown, message?: string) => void;
    ok: (value: unknown, message?: string) => void;
    notOk: (value: unknown, message?: string) => void;
    strictEqual: (actual: unknown, expected: unknown, message?: string) => void;
    notStrictEqual: (actual: unknown, expected: unknown, message?: string) => void;
    deepStrictEqual: (actual: unknown, expected: unknown, message?: string) => void;
    throws: (fn: () => unknown, message?: string) => void;
    doesNotThrow: (fn: () => unknown, message?: string) => void;
    fail: (message?: string) => void;
  };
}

globalThis.test = (name: string, run: () => void): void => {
  // Delegate to vitest's tracked it() so the test appears in the run report.
  it(name, () => {
    run();
  });
  // Preserve the legacy `ok ${name}` console output for QA grep hooks.
  // eslint-disable-next-line no-console
  console.log(`ok ${name}`);
};

// Polyfill the node:assert API surface so the legacy test files
// keep working unmodified. Uses vitest's expect() under the hood so
// failure messages and stack traces are vitest-quality.
function buildAssertMessage(message: string | undefined, suffix: string): string {
  return message ? `${message} (${suffix})` : suffix;
}

globalThis.assert = {
  equal(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "equal")).toBe(expected);
  },
  notEqual(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "notEqual")).not.toBe(expected);
  },
  strictEqual(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "strictEqual")).toBe(expected);
  },
  notStrictEqual(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "notStrictEqual")).not.toBe(expected);
  },
  deepEqual(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "deepEqual")).toEqual(expected);
  },
  notDeepEqual(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "notDeepEqual")).not.toEqual(expected);
  },
  deepStrictEqual(actual, expected, message) {
    expect(actual, buildAssertMessage(message, "deepStrictEqual")).toEqual(expected);
  },
  ok(value, message) {
    expect(value, buildAssertMessage(message, "ok")).toBeTruthy();
  },
  notOk(value, message) {
    expect(value, buildAssertMessage(message, "notOk")).toBeFalsy();
  },
  throws(fn, message) {
    expect(fn, buildAssertMessage(message, "throws")).toThrow();
  },
  doesNotThrow(fn, message) {
    expect(fn, buildAssertMessage(message, "doesNotThrow")).not.toThrow();
  },
  fail(message) {
    expect.unreachable(message);
  },
};

export {};
