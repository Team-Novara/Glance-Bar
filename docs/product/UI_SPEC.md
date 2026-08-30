# UI Specification

## Surfaces

- `/desktop`: the product-facing status-center window.
- `/showcase`: a lazy-loaded demo and QA surface for visual and interaction review.
- Settings: an in-window panel for display preference, autostart, provider health, and window controls.

## Visual direction

The desktop surface uses compact Fluent-inspired styling: rounded geometry, restrained translucency, strong hierarchy, clear semantic color, and compositor-friendly motion. Tokens and shared styling live in `src/styles/` and shared UI primitives live in `src/shared/ui/`.

## States

Status templates are selected by the scheduler from the configured desktop status kinds. Every template must present a clear label, an accessible status or progress indicator where applicable, and a safe empty/fallback state.

## Interaction

- Pointer dragging respects the lock-position preference.
- Context menu and tray actions route through feature hooks and native events.
- Keyboard and pointer interactions must not require Tauri to be present in tests.
- Animation should use transform and opacity rather than layout-affecting properties.
