# Cross-Platform Capability Plan

Windows currently has the broadest native implementation. macOS and Linux platform modules are present so the application can compile and return explicit unsupported results for capabilities that have not yet been implemented.

## Current checkpoint — 2026-09-05

Cross-platform parity is intentionally paused. The active delivery plan remains Windows-first; macOS and Linux must continue to report explicit unsupported results until each capability is implemented and validated on real target hardware. The latest merged production-composition guards do not broaden platform availability claims.

## Goal

Deliver platform capability parity without hiding platform gaps or weakening privacy boundaries.

## Design rules

- Keep platform-specific code in `src-tauri/src/window/{windows,macos,linux}.rs` and `src-tauri/src/media/{windows,macos,linux}.rs`.
- Keep Tauri command shapes stable and return bounded unsupported/unavailable results where necessary.
- Let provider capabilities and health describe support; do not branch feature templates on operating-system internals.
- Validate on real target hardware before changing a capability from unsupported to available.

## Phased work

1. Verify current build and fallback behavior on all three targets.
2. Implement one capability family at a time: window behavior, media, then system/focus sources.
3. Add native and TypeScript boundary tests for every command shape.
4. Record capability evidence and user-visible fallback behavior before declaring parity.
