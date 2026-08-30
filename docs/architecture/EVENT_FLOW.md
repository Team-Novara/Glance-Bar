# Event Flow

## Canonical path

```text
HubProvider
  -> connectProviderToEventBus
  -> HubEventBus
  -> aggregateDesktopStatusInput
  -> resolveDesktopStatusState / SchedulerService
  -> renderDesktopStatusTemplate
```

Every source, whether mock or native-backed, follows this path. A provider does not choose the visible template or import UI. A template does not call `invoke` or subscribe to a provider.

## Event bus

`createHubEventBus` stores immutable event snapshots, replaces events by id, expires stale entries, and notifies subscribers. The provider adapter isolates one failed publish from unrelated events in the same batch.

## Aggregation, resolution, and scheduling

Aggregation turns active hub events and runtime facts into desktop-status inputs. The resolver combines those inputs with configured templates and delegates visible-kind selection to the scheduler policy. The stateful scheduler service emits changes at its own cadence; it does not own event collection or UI state.

## Refresh and fallback

Feature hooks may request a runtime refresh, but all runtime access remains behind `src/runtime`. In a non-Tauri environment, providers and runtime functions return safe fallback behavior so the showcase and tests remain usable.
