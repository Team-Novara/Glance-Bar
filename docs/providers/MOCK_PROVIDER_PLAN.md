# Mock Providers

Mock providers are implemented under `src/providers/impl/mock/`. They are first-class providers, not a shortcut around the event bus.

They support deterministic showcase scenarios, browser-based testing, and fallback product behavior. Mock provider data must be stable, privacy-safe, and representative of the normalized event contract; it must not claim native capability or simulate private raw system data.

When adding a mock source, use the same lifecycle, capability, registration, and test expectations as a real provider. The only difference is the source origin and data generation method.
