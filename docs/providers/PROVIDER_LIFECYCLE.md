# Provider Lifecycle

The provider lifecycle is:

```text
Registered -> Started -> Publishing -> Paused -> Stopped
                                \-> Failed
```

- `Registered`: known by the registry but not running.
- `Started`: initialization completed and the source may begin observing.
- `Publishing`: the provider is producing usable events.
- `Paused`: deliberately inactive but still registered.
- `Stopped`: no longer observing and safe to restart.
- `Failed`: execution cannot continue without recovery.

Health remains independent: a provider can be `Started` and `Degraded`, or `Stopped` and `Unhealthy`. Lifecycle transitions are idempotent at the provider and manager boundaries.
