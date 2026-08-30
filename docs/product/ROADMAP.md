# Product Roadmap

This is the product-facing summary. [GLANCE_BAR_PLAN.md](../plans/GLANCE_BAR_PLAN.md) is the authoritative execution plan.

The near-term product-validation scope and release criteria are defined in [MVP_LAUNCH_PLAN.md](MVP_LAUNCH_PLAN.md).

## Current product baseline

Glance Bar has a functional Tauri shell, desktop and showcase surfaces, a provider-driven event pipeline, mock and real provider implementations, status scheduling, preferences, tray interaction, and automated unit coverage.

## Next product outcomes

1. Make the existing real-provider states trustworthy through capability reporting, diagnostics, and platform validation.
2. Complete platform-specific behavior for macOS and Linux without weakening Windows behavior.
3. Refine status templates and provider health UI from real usage feedback.
4. Keep the status center privacy-safe, compact, and stable as new sources are added.

## Planning rule

Treat platform work as capability work, not as a claim of feature parity. A source is available only when its runtime capability, provider lifecycle, event contract, and user-visible fallback behavior have all been validated.
