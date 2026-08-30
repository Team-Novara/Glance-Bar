# Product Requirements

## Product

Glance Bar is a compact desktop status hub. It gives users one low-interruption surface for the desktop state that currently needs attention.

## User value

- Read active media, downloads, focus, clipboard, updates, notifications, development tools, and system-health signals without opening multiple apps.
- Prioritize urgent or user-selected status while preserving a stable, predictable display.
- Control placement, floating behavior, fullscreen avoidance, autostart, and settings from the desktop shell.

## Product constraints

- The status center stays compact and readable at a glance.
- The UI consumes normalized domain state, never raw platform APIs.
- Personal or sensitive system data is not sent through the UI boundary.
- The product works with safe fallback/mock behavior when Tauri is unavailable.

## Non-goals

- Process, browser, messaging, or account scraping.
- A full notification center or task manager.
- Per-platform features presented as available when the runtime reports them as unsupported.
