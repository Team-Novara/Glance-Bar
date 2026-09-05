# Product Roadmap

This is the product-facing summary. [GLANCE_BAR_PLAN.md](../plans/GLANCE_BAR_PLAN.md) is the authoritative execution plan.

The near-term product-validation scope and release criteria are defined in [MVP_LAUNCH_PLAN.md](MVP_LAUNCH_PLAN.md).

## Current checkpoint — 2026-09-05

The current Windows-first implementation checkpoint is merged on `main` and its full CI matrix is green. The next roadmap step is evidence collection, not new integrations: packaged Windows install/tray/autostart/restart/multi-monitor/uninstall checks, a workday soak, and three tester sessions. Until those are recorded, the limited-release decision stays deferred.

## Current product baseline

Glance Bar has a functional Tauri shell, desktop and showcase surfaces, a provider-driven event pipeline, mock and real provider implementations, status scheduling, preferences, tray interaction, and automated unit coverage.

## Next product outcomes

1. Validate the already-implemented real-provider states on packaged Windows builds through capability reporting, diagnostics, and platform evidence.
2. Complete platform-specific behavior for macOS and Linux without weakening Windows behavior.
3. Refine status templates and provider health UI from real usage feedback.
4. Keep the status center privacy-safe, compact, and stable as new sources are added.

## Planning rule

Treat platform work as capability work, not as a claim of feature parity. A source is available only when its runtime capability, provider lifecycle, event contract, and user-visible fallback behavior have all been validated.
