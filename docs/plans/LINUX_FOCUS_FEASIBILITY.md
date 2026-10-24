# Linux Focus Capability — Feasibility Research Note

Research note, not an implementation slice. It assesses whether the Linux Focus
capability (the observation Windows implements as "Focus Assist") can be
implemented honestly on Linux, and fixes the gate name, the stub-then-implement
order, and the validation checklist that must be satisfied before anything
reports `available`. No code is written or changed by this document. Repo facts
cite `file:line`; external mechanism facts cite fetched URLs (all fetched
2026-10-24). Anything not verified from a source is marked UNVERIFIED.

## The contract being filled (repo facts)

The shared payload is `FocusAssistStatePayload` — `active: bool`, `profile:
String`, `code: &'static str`, `controllable: bool`, `checked_at: u64`
(`src-tauri/src/types.rs:305-310`), plus the derived
`NotificationSummaryPayload { focus_assist_active, checked_at }`
(`src-tauri/src/types.rs:315-318`). The contract is deliberately coarse: a
quiet-mode fact, a bounded code, a controllability fact, and a timestamp.

- **Windows path.** `read_focus_assist_state` reads two values out of the
  HKCU QuietHours registry key (`NFPEnabled`, `Profile`,
  `src-tauri/src/commands/focus.rs:8-50`); on success it reports `code:
  "available"`, `controllable: true` (`focus.rs:43-49`); on any read failure
  the conservative `active: false`, `code: "error"`, `controllable: false`
  (`focus.rs:17-25`, `focus.rs:31-39`). Control is implemented on Windows via
  a registry write (`focus.rs:64-78`) and returns an explicit error on every
  other platform (`focus.rs:80-83`).
- **Non-Windows stub.** Every other platform today returns `active: false`,
  empty profile, `code: "unsupported"`, `controllable: false`
  (`focus.rs:52-61`). That stub — byte-for-byte — is what a gated Linux
  implementation must return until the gate flips.
- **The monitor thread already runs on Linux.** `start_focus_monitor` is
  spawned unconditionally on all platforms (`src-tauri/src/lib.rs:350`), polls
  every 2s (`FOCUS_ASSIST_MONITOR_INTERVAL`,
  `src-tauri/src/monitoring/mod.rs:25`), and emits
  `status-center://focus-assist-changed` on any payload-field change and
  `status-center://notifications-changed` on the active-flag toggle
  (`monitoring/mod.rs:23-24`, `monitoring/mod.rs:82`, `monitoring/mod.rs:90`).
  On Linux it currently polls the stub every 2s and never emits (nothing
  changes). This is significant for feasibility: the event-emission
  infrastructure needs no new work, only a real payload to observe.
- **The gate pattern.** `MPRIS_VALIDATED` (`src-tauri/src/media/linux.rs:28`)
  is the precedent: a module-level `const …_VALIDATED: bool = false`, checked
  before any platform access (`media/linux.rs:60`), returning a payload
  identical to the pre-implementation stub, with a gate-off contract test
  (`media/linux.rs:633-652`) that must be updated together with the flip.
  `LINUX_WINDOW_VALIDATED` (`src-tauri/src/window/linux.rs:40`) and
  `MACOS_MEDIA_VALIDATED` (`src-tauri/src/media/macos.rs:62`) repeat it. The
  governing design rule: "Validate on real target hardware before changing a
  capability from unsupported to available"
  (`docs/plans/STAGE6_CROSS_PLATFORM_DESIGN.md:18`).
- **Frontend expectations.** The focus provider tests pin `code: "available"`
  with `controllable: true` and `code: "error"` with `controllable: false`
  (`src/providers/impl/real/realFocusProvider.test.ts:81-82`,
  `:212-213`) — the code vocabulary is `available` / `error` / `unsupported`
  and must not grow new meanings casually.

## Q1 — GNOME: Do Not Disturb is one GSettings boolean, readable in-process

**The key.** The `org.gnome.desktop.notifications` schema (path
`/org/gnome/desktop/notifications/`) defines `show-banners`, type `b`, default
`true`, summary "Show notification banners", description "Whether notification
banners are visible for application notifications."
([gsettings-desktop-schemas master](https://gitlab.gnome.org/GNOME/gsettings-desktop-schemas/-/raw/master/schemas/org.gnome.desktop.notifications.gschema.xml.in)).
The sibling per-application key
(`org.gnome.desktop.notifications.application show-banners`) exists too, but
system-level DND is the parent schema's key.

**GNOME Shell itself equates DND with `!show-banners`.** On GNOME main (49),
`js/ui/dateMenu.js` constructs `Gio.Settings({schema_id:
'org.gnome.desktop.notifications'})`, connects `changed::show-banners`, and
computes `const doNotDisturb = !this._settings.get_boolean('show-banners')`
([gnome-shell main, js/ui/dateMenu.js](https://gitlab.gnome.org/GNOME/gnome-shell/-/raw/main/js/ui/dateMenu.js)).
This is the strongest available citation for the mapping
`active = !show-banners` — it is the same derivation the shell ships.

**Version range.** Search-corroborated, not fetched from primary sources: the
DND toggle was introduced with GNOME 3.26 (September 2017) and moved to Quick
Settings in GNOME 49; the 2020 `dateMenu.js` "indicate when do-not-disturb is
on" commit already consumed `show-banners`
([commits-list archive](https://lists.gnome.org/archives/commits-list/2020-January/msg09629.html)).
Verified directly: the schema on master defines the key and GNOME Shell main
consumes it. Per-version presence from 3.26 onward is UNVERIFIED in detail and
is a validation-checklist item (pin the actual target distro versions).

**No D-Bus/portal read path.** Both portal notification interfaces are
send-only. `org.freedesktop.portal.Notification` offers
`AddNotification`/`RemoveNotification`, `SupportedOptions`, `version`, and the
`ActionInvoked` signal — no property or method can query DND
([portal spec](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.portal.Notification.html));
the same holds for the backend-side
[`org.freedesktop.impl.portal.Notification`](https://flatpak.github.io/xdg-desktop-portal/docs/doc-org.freedesktop.impl.portal.Notification.html).
We found no D-Bus property for GNOME DND in the interfaces examined; the
dconf/GSettings key is the canonical store, which is exactly where GNOME Shell
reads it (above).

**How to read it without the `gsettings` binary.** Three options:

1. **libgio in-process (recommended).** The Rust `gio` crate exposes
   `gio::Settings` and `gio::SettingsSchemaSource`. `gio` 0.18.4 and `glib`
   0.18.5 are already resolved in the Linux dependency tree via Tauri's GTK
   stack (`src-tauri/Cargo.lock:1545`, `:1577`), and libgio is already loaded
   at runtime by the GTK-based app — adding `gio = "0.18"` as a Linux-target
   dependency compiles no new packages (same argument as the
   `raw-window-handle` line, `src-tauri/Cargo.toml:58-60`). Reads are plain
   getter calls; no main loop is required for polling getters (the `changed`
   signal is what needs a main context). **Required guard:** `g_settings_new`
   is documented as an error when the schema does not exist, and the docs
   recommend checking with `g_settings_schema_source_lookup` first
   ([docs.gtk.org](https://docs.gtk.org/gio/ctor.Settings.new.html)) — on a
   non-GNOME session the schema is absent, and the C error path aborts (the
   Rust binding panics; exact binding behavior to confirm at implementation,
   UNVERIFIED). The implementation must do the schema-source lookup and report
   `code: "unsupported"` when the schema is missing.
2. **Shell out to `gsettings get`.** Rejected: process spawn per poll, binary
   presence assumption, string parsing. The repo's platform modules avoid
   shell-outs (media uses zbus, `src-tauri/src/media/linux.rs:122-126`;
   window uses x11rb, `src-tauri/src/window/linux.rs`).
3. **zbus-to-dconf / direct GVDB read.** Rejected honestly: dconf's D-Bus
   service (`ca.desrt.dconf`) is write-only — "Reading values from the dconf
   database does not involve the service; it is only needed for writes";
   readers mmap the `~/.config/dconf/user` GVDB database directly
   ([dconf-service(1)](https://docs.oracle.com/cd/E88353_01/html/E37839/dconf-service-1.html),
   [Arch man page](https://man.archlinux.org/man/dconf-service.1.en)). A Rust
   GVDB reader exists (`gvdb` 0.10.1, [docs.rs](https://docs.rs/gvdb/latest/gvdb/))
   but makes no dconf-compatibility claim; the on-disk database is written
   back asynchronously by the dconf service and is not a published contract.
   libgio's GSettings wraps exactly this machinery with the robustness
   handled — going around it buys fragility, not independence.

**Change signal.** GSettings emits `changed::show-banners` (GNOME Shell itself
subscribes to it — the dateMenu.js citation above), so a push-based upgrade
exists if the 2s poll ever proves insufficient (see "Event emission").

## Q2 — KDE Plasma: a D-Bus read property exists; the config file is the fallback

**The verified D-Bus path (recommended primary).** Plasma's notification
daemon (hosted by plasmashell, which claims the `org.freedesktop.Notifications`
name) exports a read-only boolean property `Inhibited` on
`org.freedesktop.Notifications` with `EmitsChangedSignal` true
([libnotificationmanager/dbus/org.freedesktop.Notifications.xml](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/dbus/org.freedesktop.Notifications.xml)).
The export is real, not just an interface declaration: `ServerPrivate::init()`
registers the object at `/org/freedesktop/Notifications` and claims
`org.freedesktop.Notifications` (replacing an existing owner when it is the
D-Bus "master", i.e. plasmashell), `NotificationsAdaptor` exports the object's
properties, and `onInhibitedChanged()` manually emits `PropertiesChanged` with
`{"Inhibited": inhibited()}`
([libnotificationmanager/server_p.cpp](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/server_p.cpp)).
`Server::inhibited()` proxies the private state
([server.cpp](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/server.cpp)).
Semantically this is the shell's **aggregate** DND state — it folds in
app-requested inhibitions and the runtime auto-inhibit conditions (fullscreen,
mirrored screens), which the file store alone cannot see (below). A zbus
`Properties.Get("org.freedesktop.Notifications", "Inhibited")` maps one-to-one
onto `active`, reuses the zbus 5 stack already in the Linux dependencies
(`src-tauri/Cargo.toml:56`) and the media provider's cached-connection +
bounded-timeout pattern (`src-tauri/src/media/linux.rs:105-141`). **Never call
`Inhibit`/`UnInhibit` to "detect" state** — they are mutations (they return an
inhibition id and add/remove an inhibition, same interface XML).

**The persisted store (fallback; verified).** Notification settings live in
the KConfig file `plasmanotifyrc` (→ `~/.config/plasmanotifyrc`)
([settings.cpp](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/settings.cpp)),
group `DoNotDisturb`, entries: `Until` (DateTime), `WhenScreensMirrored` /
`WhenScreenSharing` / `WhenFullscreen` (Bool, default true),
`NotificationSoundsMuted` (Bool, default false)
([kcfg/donotdisturbsettings.kcfg](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/kcfg/donotdisturbsettings.kcfg)).
There is **no `Enabled` boolean**. The user-facing toggle writes the manual
state as `notificationsInhibitedUntil` = now + 1 year — the code comments this
as "Effectively 'in a year' is 'until turned off'" — and disabling revokes it
([applets/notifications/global/Globals.qml](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/applets/notifications/global/Globals.qml)).
The documented semantics: DND is active when
`notificationsInhibitedUntil` points to a future date **or**
`notificationsInhibitedByApplication` is true, and "When invalid or in the
past, do not disturb mode should be considered disabled"
([settings.h](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/settings.h)).
The `plasmanotifyrc` `DoNotDisturb` group is corroborated outside the source
tree for both the Plasma 5 era (a 2019 write-up driving it via
`kwriteconfig5 --file plasmanotifyrc --group DoNotDisturb`,
[bazile.org](https://bazile.org/writing/2019/notification_sounds_for_gnome_and_kde.html))
and current Plasma (a 2025 KDE commit touching the same group,
[kde-doc-english list](https://mail.kde.org/pipermail/kde-doc-english/2025-April/025224.html)).

**Honest limitations of the file path.** The file only holds the *persisted*
state: it can express the manual/timed DND component (`Until` in the future)
and the auto-inhibit *preferences*, but not the runtime conditions (a
fullscreen app focused right now) nor app-requested inhibitions, which are
computed in the shell and never persisted. Reading the file therefore
underreports the aggregate. The exact QDateTime serialization format of the
`Until` entry is UNVERIFIED and must be pinned during validation; parse
failure must map to `code: "error"`, never to a guessed state.

**On the interface name guessed in the task.** `plasma-org.kde.plasma.notifications`
does exist as a *plasmoid* config file naming pattern, but the verified global
DND store in current master is `plasmanotifyrc`; no do-not-disturb key in
`plasma-org.kde.plasma.notifications` was verifiable on master (the applet no
longer ships a `package/contents/config` there — [applet tree](https://invent.kde.org/api/v4/projects/plasma%2Fplasma-workspace/repository/tree?path=applets/notifications&per_page=100)).
Plasma 5-era per-applet DND storage under that filename is UNVERIFIED. The
read path must be pinned against the Plasma versions actually targeted during
validation.

**No other D-Bus surface.** Plasma's own `org.kde.NotificationManager`
interface defines only `RegisterWatcher`, `UnRegisterWatcher`, `InvokeAction`
— no DND property
([org.kde.notificationmanager.xml](https://invent.kde.org/plasma/plasma-workspace/-/raw/master/libnotificationmanager/dbus/org.kde.notificationmanager.xml)).
Whether the `Inhibited` property exists on Plasma 5.x daemons is UNVERIFIED
(the interface XML is master); the validation checklist pins it.

**Environment caveat.** On non-KDE sessions the `org.freedesktop.Notifications`
name is typically owned by other daemons (dunst, mako, xfce4-notifyd) that are
not expected to export `Inhibited`; a missing property must map to
`code: "unsupported"` (Plasma DND surface absent), not `error` and never a
fabricated `active`.

## Q3 — Other environments: unsupported, conservative default

- **XFCE** has a global Do Not Disturb mode
  ([docs.xfce.org](https://docs.xfce.org/apps/notifyd/start)), stored in
  xfconf channel `xfce4-notifyd`, boolean property `/do-not-disturb`, default
  false, with a change signal the panel plugin itself consumes
  ([notification-plugin.c](https://gitlab.xfce.org/apps/xfce4-notifyd/-/raw/master/panel-plugin/notification-plugin.c)).
  A real mechanism — but xfconf is another D-Bus service and another config
  dialect. Out of scope for the first slice; conservative `unsupported`.
- **Cinnamon** (GSettings/dconf-based) uses
  `org.cinnamon.desktop.notifications display-notifications` (boolean, false
  = silenced; corroborated by community sources:
  [cinnamon issue #9391](https://github.com/linuxmint/cinnamon/issues/9391)).
  A future GSettings-based slice could likely serve it with the same code
  path as GNOME, but it is not validated here — out of scope, `unsupported`.
- **MATE, Budgie, sway/i3+third-party daemons, no WM:** mechanism not
  researched (UNVERIFIED); expectation is `unsupported`.

The design rule this follows is the STAGE6 one: provider capabilities and
health describe support; an environment where the mechanism cannot be
verified reports explicit unsupported results
(`docs/plans/STAGE6_CROSS_PLATFORM_DESIGN.md:15-18`).

## Q4 — Mapping onto the FocusAssistStatePayload contract

| Field | GNOME | KDE | Notes |
| --- | --- | --- | --- |
| `active` | `!show-banners` (schema read) | D-Bus `Inhibited` property | Both are the environment's own notion of "notifications currently silenced". |
| `profile` | `""` (always) | `""` (always) | Linux has no profile concept; the Windows provider also writes empty on its error paths (`focus.rs:33`). Never invented. |
| `code` | `available` / `error` / `unsupported` | same vocabulary | `unsupported`: schema absent (non-GNOME) / property absent (non-Plasma daemon) / gate off; `error`: present surface unreadable; `available`: read succeeded. Matches the Windows focus vocabulary (`focus.rs:22`, `:45`, `:57`) pinned by frontend tests. |
| `controllable` | `false` on every path | `false` on every path | **Honest answer: yes, observation-only.** Both desktops are technically writable (gsettings set; config write), but Glance Bar implements no Linux control — `stop_focus_session` keeps returning the existing error (`focus.rs:80-83`). `controllable` describes the implemented capability, exactly as the Windows provider reports `true` only because it implements the write (`focus.rs:47`). |
| `checked_at` | `unix_time_ms()` | `unix_time_ms()` | Same helper as Windows (`src-tauri/src/lib.rs:41`). |

Derived `NotificationSummaryPayload` comes free: the monitor thread computes
it from `active` (`monitoring/mod.rs:85-91`).

**Event emission: poll vs change signal.** Recommendation: keep the existing
2s poll (`monitoring/mod.rs:25`) — the thread already runs on Linux
(`lib.rs:350`), the Windows path is itself a 2s registry poll, and DND toggles
are rare user actions where 2s latency is fine. Both environments offer
push-based upgrades if ever needed: KDE's `PropertiesChanged` on `Inhibited`
(`EmitsChangedSignal` true, verified above) via a zbus signal stream, and
GNOME's `changed::show-banners` GSettings signal (needs a glib main context
thread). Neither justifies new infrastructure in the first slice; note them as
the documented upgrade path. Any D-Bus read must carry the media provider's
bounded-timeout pattern (~1s, `media/linux.rs:105`) so a hung daemon cannot
stall the poll loop.

## Q5 — Privacy: a boolean DND state is coarse and bounded

- The payload crossing the boundary is `active` + `code` + `controllable` +
  `checked_at` (+ an always-empty `profile`): a single system quiet-mode
  boolean and bounded enums. The repo rule is "IPC exposes only coarse
  percentages and bounded enums. Never expose process lists, paths,
  credentials, usernames, or raw private payloads."
  (`AGENTS.md:47`) — this payload is the bounded-enum category by
  construction.
- The privacy checklist's forbidden facts are not touched: DND state is not
  notification text, metadata, or notification-center contents, no app
  identities are read or emitted, and nothing about *which* app or what
  content was silenced crosses the boundary
  (`docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md:28-38`).
- Diagnostics follow the error-summary rules: bounded codes only
  (`available`/`error`/`unsupported`), no raw file contents, no D-Bus error
  strings, no environment dumps
  (`docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md:46`).
- Precedent: the Linux media provider keeps every free-form value out of the
  boundary and never lets raw D-Bus data leave its module
  (`media/linux.rs:16-20`); the focus implementation should be held to the
  same standard — the GNOME read is one boolean getter, the KDE read one
  property get; neither surfaces anything else.

## Recommendation

**Gate name: `LINUX_FOCUS_VALIDATED`** — mirroring `LINUX_WINDOW_VALIDATED`
(`window/linux.rs:40`), `MPRIS_VALIDATED` (`media/linux.rs:28`), and
`MACOS_MEDIA_VALIDATED` (`media/macos.rs:62`): a `const …_VALIDATED: bool =
false` next to the Linux implementation, checked before any mechanism access,
with a gate-off contract test asserting the payload is identical to today's
stub and that no schema/D-Bus access happens while gated (pattern:
`media/linux.rs:633-652`).

**Stub-then-implement order.**

1. **Stub slice (no behavior change).** Introduce the gate and the Linux
   module (natural home: a `linux` submodule of the focus command module —
   `commands/focus.rs` + `commands/focus/linux.rs` — keeping the existing
   per-OS dispatch in `read_focus_assist_state` while mirroring the media
   gate pattern; a top-level `focus/{linux}.rs` platform module like
   `media/` is the alternative and is not required). Gate off, it returns
   exactly the payload of `focus.rs:52-61`. Add the gate test. Land before
   any mechanism code.
2. **Implementation slice (behind the gate, still `unsupported`).** GNOME:
   `gio = "0.18"` Linux-target dependency (0.18 series only — the lock
   already resolves gio 0.18.4 / glib 0.18.5 via Tauri's GTK stack,
   `Cargo.lock:1545`/`:1577`; a newer series would compile a second glib
   stack, same alignment argument as the zbus comment,
   `Cargo.toml:51-56`), schema-source lookup guard, `!show-banners` mapping.
   KDE: zbus 5 `Properties.Get` of `Inhibited` on
   `org.freedesktop.Notifications` with a cached connection and ~1s method
   timeout (`media/linux.rs:105-141` pattern), missing-property →
   `unsupported`, bus failure → `error`. Unit-test the pure mapping layers
   (schema-missing → unsupported, boolean inversion, property-absent →
   unsupported) without a bus or schema, as the media tests do
   (`media/linux.rs:405-410`).
3. **Validation slice (real hardware, below), then flip.** Flip the const,
   update the gate test in the same change, and record the evidence in the
   STAGE6 checkpoint format.

**Validation checklist before the gate flips.**

- **GNOME, X11 and Wayland sessions, pinned distro versions (include one
  GNOME ≥ 49 where the toggle moved to Quick Settings):** toggle DND from the
  UI and confirm the payload flips `active` within one 2s poll; confirm
  `profile` stays empty and `controllable` stays false; confirm the
  `status-center://focus-assist-changed` event fires through the existing
  monitor on toggle and on unlock/login edge cases.
- **GNOME, non-GNOME session:** confirm the schema-source guard returns
  `unsupported` without panicking where `org.gnome.desktop.notifications` is
  absent (XFCE or a bare WM), and that no gio panic path is reachable
  (`g_settings_new` error contract,
  [docs.gtk.org](https://docs.gtk.org/gio/ctor.Settings.new.html)).
- **KDE, pinned Plasma 6.x:** toggle DND in the notification applet popup;
  confirm the `Inhibited` property flips and is readable via the cached
  connection; confirm `PropertiesChanged`-driven behavior matches the 2s poll
  (poll should be sufficient); confirm DND-off reports `active=false`.
- **KDE, plasma down / property absent:** with the notification daemon not
  owning the name (or on a non-Plasma session), confirm `unsupported`, bounded
  ~1s failure, no poll-loop stall, no event storm.
- **Per-version pins:** whether the `Inhibited` property exists on the oldest
  targeted Plasma; whether `show-banners` is present on the oldest targeted
  GNOME (3.26 continuity is search-corroborated only); the exact KConfig
  `Until` serialization if the config-file fallback is ever implemented.
- **Idle cost:** confirm the 2s poll with one boolean read per tick costs
  no measurable CPU/battery regression versus the Windows registry poll it
  mirrors.
- **Gate-off regression:** `cargo test` on Linux passes with the gate-off
  contract test (payload byte-identical to `focus.rs:52-61`, no bus/schema
  touch), plus `cargo fmt --check` / `cargo check` / `cargo clippy` (CI
  flags) clean, matching the repo's quality gates (`AGENTS.md:52-62`).

**Open questions / UNVERIFIED carried into validation:** Plasma 5.x surface
(`Inhibited` property and file schema); KConfig `Until` serialization format;
gio Rust binding panic behavior on the missing-schema C error path; GNOME
per-version key presence below main; MATE/Budgie mechanisms (not researched);
runtime cost of the gio schema lookup per read (or whether to cache it).
