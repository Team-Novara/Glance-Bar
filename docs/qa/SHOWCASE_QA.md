# Showcase QA

`/showcase` is a lazy-loaded review surface for visual states, provider scenarios, and interaction checks. It deliberately runs without requiring a Tauri process.

## Verify

```bash
npm run dev:showcase
npm run qa:showcase:interactions
```

Review desktop and narrow viewports, transitions between status templates, interactive scenario controls, keyboard access, visible focus, and empty/fallback states. Capture screenshots only when visual changes need review evidence.

The automated interaction journey uses the `i18nextLng` cache key to make role
labels deterministic. Tauri fixture events are intentionally local to the
Showcase event bus; after navigation to `/desktop`, the journey asserts that
the fixture title and subtitle are absent from the production shell.

`/desktop` is the product-facing shell. It can use mock or fallback data outside Tauri, but native-specific behavior must be checked with `npm run tauri -- dev` on a supported platform.
