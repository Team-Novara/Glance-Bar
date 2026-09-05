# Privacy-safe diagnostics and bug reports

The Settings panel's **Privacy-safe Diagnostics** section is the supported
evidence surface for MVP bug reports. It shows a bounded projection only:

- app version, coarse platform, runtime, and diagnostics generation time;
- provider kind, lifecycle, health, capability origin/support;
- an allowlisted last error code and last checked timestamp when available.

The projection never includes provider identifiers or names, event payloads,
file paths, filenames, clipboard text, media titles/artists, notification
content, usernames, credentials, hostnames, or arbitrary native error text.
The native command `get_app_runtime_metadata` returns only the app version,
coarse platform, and `tauri` runtime marker.

## Bug-report template

```text
Build / commit:
Windows version and architecture:
Glance Bar version:

Steps to reproduce:
1.
2.
3.

Expected:

Actual:

Diagnostics (Settings -> Privacy-safe Diagnostics):

Optional redacted screenshot:

Privacy check: no paths, filenames, clipboard/media/notification content,
usernames, credentials, or raw payloads included.
```

Do not paste the full application log or native error text into an issue
without removing machine-identifying values first. If a report needs details
that are intentionally excluded from this view, request them explicitly and
redact before sharing.

## Verification checklist

- [ ] Confirm the displayed app version and commit match the tested build.
- [ ] Confirm every provider row contains only bounded enums and timestamps.
- [ ] Search the copied/screenshot evidence for paths, names, clipboard text,
      media titles, usernames, credentials, and raw payloads.
- [ ] Include the exact reproduction steps and expected/actual result.
