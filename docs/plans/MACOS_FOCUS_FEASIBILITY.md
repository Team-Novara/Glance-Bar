# macOS Focus Capability — Feasibility Research Note

Research note, not an implementation slice. It assesses whether the macOS Focus
capability (the observation Windows implements as "Focus Assist") can be
implemented honestly on macOS, mirroring the structure and honesty bar of the
Linux note (`docs/plans/LINUX_FOCUS_FEASIBILITY.md`). No code is written or
changed by this document. Repo facts cite `file:line`; external mechanism facts
cite fetched URLs (all fetched 2026-10-25). Anything not verified from a source
is marked UNVERIFIED. One environment caveat up front: this note was written
without access to a Mac, so no runtime behavior of any macOS API was executed
here — every macOS-runtime claim below is documentation or community
evidence, and anything that would need a real Mac to confirm is called out.

**Verdict up front: the capability stays unsupported on macOS.** A documented
read API exists (`INFocusStatusCenter`, macOS 12+), but it reports an
app-relative fact that cannot fill this payload's `active` honestly. Details
in Q1 and the Recommendation. No `MACOS_FOCUS_VALIDATED` gate is named.

## The contract being filled (repo facts)

The shared payload is `FocusAssistStatePayload` — `active: bool`, `profile:
String`, `code: &'static str`, `controllable: bool`, `checked_at: u64`
(`src-tauri/src/types.rs:303-311`), plus the derived
`NotificationSummaryPayload { focus_assist_active, checked_at }`
(`src-tauri/src/types.rs:313-318`). The contract is deliberately coarse: a
quiet-mode fact, a bounded code, a controllability fact, and a timestamp.

- **Windows path.** `read_focus_assist_state` reads two values out of the
  HKCU QuietHours registry key (`NFPEnabled`, `Profile`,
  `src-tauri/src/commands/focus.rs:8-50`); on success it reports `code:
  "available"`, `controllable: true` (`focus.rs:43-49`); on any read failure
  the conservative `active: false`, `code: "error"`, `controllable: false`
  (`focus.rs:17-25`, `focus.rs:31-39`). Control is implemented on Windows via
  a registry write (`focus.rs:64-78`) and returns an explicit error on every
  other platform (`focus.rs:80-83`, reached from `stop_focus_session`,
  `focus.rs:108-112`).
- **Non-Windows stub.** Every other platform today returns `active: false`,
  empty profile, `code: "unsupported"`, `controllable: false`
  (`focus.rs:52-61`); the non-Windows notification summary reports
  `focus_assist_active: false` (`focus.rs:95-101`). That stub — byte-for-byte
  — is what any gated macOS implementation would have to keep returning until
  a gate flips.
- **The monitor thread already runs on macOS.** `start_focus_monitor` is
  spawned unconditionally on all platforms (`src-tauri/src/lib.rs:350`), polls
  every 2s (`FOCUS_ASSIST_MONITOR_INTERVAL`,
  `src-tauri/src/monitoring/mod.rs:25`), and emits
  `status-center://focus-assist-changed` on any payload-field change and
  `status-center://notifications-changed` on the active-flag toggle
  (`monitoring/mod.rs:22-24`, `monitoring/mod.rs:82`, `monitoring/mod.rs:84-91`).
  On macOS it currently polls the stub every 2s and never emits (nothing
  changes; the doc comment still describes only the Windows registry read,
  `monitoring/mod.rs:55-58`). As on Linux, the event-emission infrastructure
  needs no new work — only a real payload to observe.
- **The gate pattern has a macOS precedent.** `MACOS_MEDIA_VALIDATED`
  (`src-tauri/src/media/macos.rs:62`) is the direct precedent: a complete
  macOS observation implementation sits behind a module-level `const …
  _VALIDATED: bool = false`, the gate is checked before any mechanism access
  (`media/macos.rs:102-104`), and gate-off returns a payload byte-identical
  to the pre-implementation stub (`media/macos.rs:64-80`). Its module comment
  also models the honesty style this note follows: document the rejected
  private-framework alternative with reasons (`media/macos.rs:16-19`), and
  frame "does the public surface actually behave as needed" as exactly what
  the validation gate exists to answer on real hardware
  (`media/macos.rs:25-31`). Siblings: `MPRIS_VALIDATED`
  (`media/linux.rs:28`), `LINUX_WINDOW_VALIDATED`
  (`window/linux.rs:40`). Governing design rule: "Validate on real target
  hardware before changing a capability from unsupported to available"
  (`docs/plans/STAGE6_CROSS_PLATFORM_DESIGN.md:18`; design rules at
  `:15-18`).
- **Frontend expectations.** The focus provider tests pin `code:
  "available"` with `controllable: true` and `code: "error"` with
  `controllable: false` (`src/providers/impl/real/realFocusProvider.test.ts:81-82`,
  `:212-213`) — the code vocabulary is `available` / `error` /
  `unsupported` and must not grow new meanings casually.

## Q1 — Reading system Focus state on macOS: a documented API exists, but it reports the wrong fact

### The historical defaults path, and where it broke

The mechanism history is well documented by the Mac-admin community. The
`doNotDisturb.sh` script and its companion post track it per macOS version:

- **macOS 10.13–10.15 (Catalina and earlier).** `defaults -currentHost read
  com.apple.notificationcenterui doNotDisturb` returns a "c-style boolean 0
  (off) or 1 (on)"
  ([brunerd, "Respecting Focus and meeting status in your Mac scripts"](https://www.brunerd.com/blog/2022/03/07/respecting-focus-and-meeting-status-in-your-mac-scripts-aka-dont-be-a-jerk/),
  [doNotDisturb.sh](https://raw.githubusercontent.com/brunerd/macAdminTools/main/Scripts/doNotDisturb.sh)).
- **macOS 11 (Big Sur).** The key moved into an embedded plist: the
  `dnd_prefs` key of the `com.apple.ncprefs` preference domain holds a
  base64-encoded plist whose `userPref:enabled` is the state; the script's
  comment notes "this only works for macOS 11 - macOS 12 does not affect any
  of the settings in com.apple.ncprefs" (same two sources).
- **macOS 12 (Monterey) and later.** The plist paths are dead: "For macOS 12
  Monterey they've switched from a plist to a JSON file" (brunerd, fetched).
  Focus state now lives in JSON files under `~/Library/DoNotDisturb/DB/`
  (see Q3). This matches the Rust
  [macos-focus](https://raw.githubusercontent.com/eugenehp/macos-focus/main/README.md)
  library's version split: legacy `defaults`-write support only for 10.15–11,
  Focus-database support for macOS 12+.
- **What changed semantically in Monterey:** "Do Not Disturb" became one mode
  inside the new cross-device **Focus** system (contemporary coverage:
  [Macworld, Aug 2021](https://www.macworld.com/article/353477/how-to-macos-monterey-set-up-customize-focus-modes-mac.html)
  — search-corroborated, not fetched; Apple's current guide treats DND as a
  Focus: "Turn on the Do Not Disturb Focus in Control Center"
  ([Set up a Focus on Mac](https://support.apple.com/guide/mac-help/set-up-a-focus-to-stay-on-task-mchl613dc43f/mac))).
  Community reports from the Monterey era describe the old key going stale
  (returning `1` regardless of actual state,
  [SO 71807412](https://stackoverflow.com/questions/71807412/how-to-read-do-not-disturb-using-applescript)
  — search-corroborated only; the page was not fetchable from this
  environment, so the exact wording is UNVERIFIED).

So: **macOS 12.0 (Monterey) is the version that broke the historical read
path**, and nothing in the `defaults`/plist world replaced it (the
`com.apple.ncprefs` comment above; brunerd's Monterey branch reads the JSON
files instead).

### The modern documented API: `INFocusStatusCenter` (Intents framework)

This is the one genuinely documented, non-private surface. It was added with
Focus in iOS 15 / macOS 12 and is documented in Apple's public API reference:

- `INFocusStatusCenter` — "An object that maintains the user's current focus
  status and your app's ability to access it." The documented platforms array
  includes `{"introducedAt":"12.0","name":"macOS"}` (also iOS/iPadOS/Mac
  Catalyst 15.0, watchOS 8.0, visionOS 1.0)
  ([INFocusStatusCenter docs JSON](https://developer.apple.com/tutorials/data/documentation/intents/infocusstatuscenter.json)).
- Usage shape: `INFocusStatusCenter.default.authorizationStatus`,
  `requestAuthorization(completionHandler:)` →
  `INFocusStatusAuthorizationStatus` (`.notDetermined` / `.restricted` /
  `.denied` / `.authorized` — all four cases documented; platforms again
  include macOS 12.0)
  ([INFocusStatusAuthorizationStatus docs JSON](https://developer.apple.com/tutorials/data/documentation/intents/infocusstatusauthorizationstatus.json)).
- `center.focusStatus` is an `INFocusStatus`, whose **only documented
  property is `isFocused: Bool?`** — "The user's preference for receiving
  communication notifications" — with the overview: "Use this information to
  display that the user is in a focus to other people in your communication
  service." No mode name, no mode identifier, nothing else
  ([INFocusStatus docs JSON](https://developer.apple.com/tutorials/data/documentation/intents/infocusstatus.json)).
- **Authorization model.** Apple's sample article is explicit: "Accessing a
  user's Focus status requires their authorization. To let the user know how
  the app uses their Focus status, include a usage description string …
  `Privacy - Focus Status Usage Description`" in Info.plist; the sample maps
  the authorization result to `.denied` / `.authorized` / `.notDetermined` /
  `.restricted` with `@unknown default` → `.notSupported`
  ([Handling Communication Notifications and Focus Status Updates](https://developer.apple.com/tutorials/data/documentation/usernotifications/handling-communication-notifications-and-focus-status-updates.json)).
- **Capability checklist from the same sample:** Push notifications,
  Communication notifications, Time Sensitive notifications, and SiriKit.
  "Communication notifications" is the
  `com.apple.developer.usernotifications.communication` entitlement
  (addable in Xcode's Signing & Capabilities without a special Apple request
  per [Microsoft MAUI entitlement docs](https://learn.microsoft.com/en-us/dotnet/maui/ios/entitlements?view=net-maui-10.0)
  and [Expo capabilities reference](https://docs.expo.dev/build-reference/ios-capabilities)
  — search-corroborated; Apple's own entitlements page for the key was not
  fetchable). Note one App Store validation consequence reported by the
  community: apps carrying this entitlement must declare
  `INSendMessageIntent`/`INStartCallIntent` usage or receive an ITMS-90894
  rejection ([Pushwoosh issue](https://github.com/Pushwoosh/pushwoosh-phonegap-plugin/issues/359)
  — search-corroborated; whether that rule applies to Developer-ID
  distribution is UNVERIFIED).
- **macOS-specific community evidence.**
  - A native, Developer-ID-signed macOS app (Irrlicht) reads focus status
    successfully through `INFocusStatusCenter` — and hit a real
    toolchain-fragility lesson: under the macOS 26 SDK, accessing
    `.default` via KVC (`value(forKey:)`) raises `NSUnknownKeyException` and
    SIGABRTs at launch ("INFocusStatusCenter.default is no longer
    KVC-discoverable"); the fix was a `responds(to:)`-guarded selector call
    ([Irrlicht issue #782](https://github.com/ingo-eichhorst/Irrlicht/issues/782)).
  - Home Assistant's Mac Catalyst build logged
    `DNDErrorDomain Code=1004: App is missing Communication Notifications
    entitlement` when querying focus status
    ([home-assistant/iOS #5904](https://github.com/home-assistant/iOS/issues/5904))
    — a single data point suggesting the Communication Notifications
    entitlement may be load-bearing for focus reads on macOS specifically;
    the maintainer disputes that mapping in-thread (contested, both visible
    in the fetched thread).
  - A 2026 survey of focus-state sources concluded: "returns only an
    app-relative `isFocused: Bool?`; good as a don't-interrupt gate, nothing
    more" ([tesseract issue #304](https://github.com/spokvulcan/tesseract/issues/304)).
- **Rust integration is mechanically available.** The `objc2-intents` crate
  (0.3.2, Oct 2026) ships bindings including `INFocusStatusCenter` and
  `INFocusStatus` ([docs.rs/objc2-intents](https://docs.rs/objc2-intents)),
  and the repo already vendors the aligned objc2 family for macOS targets
  (`src-tauri/Cargo.toml:44-49`: objc2 0.6, objc2-foundation 0.3,
  objc2-app-kit 0.3, objc2-media-player 0.3, with the family-alignment
  comment at `Cargo.toml:39`). So the *mechanism* is reachable from the
  existing stack — that is not the problem.

### Why the semantics do not match this contract

The blocker is not access, plumbing, or approval — it is what the API
reports:

1. **`isFocused` is app-relative, not aggregate.** Apple's sample states the
   returned value "will be true if Focus is enabled and this app isn't in
   its Allowed Apps list"; unauthorized apps get `nil` (sample article,
   fetched). The property's own abstract ("the user's preference for
   receiving communication notifications") and the framework overview
   ("display that the user is in a focus to other people in your
   communication service") frame it as a fact *about communicating with this
   user*, not a system state. Community experience adds a second gating
   condition: the value is only meaningful if the user has enabled Focus
   status sharing for the app (per-focus "Share Focus Status" toggle and/or
   per-app permission; [SO 68716473](https://stackoverflow.com/questions/68716473/whats-the-api-for-querying-focus-mode-on-ios-15)
   — search-corroborated; the exact macOS UI location for these toggles is
   UNVERIFIED).
2. **"Focus off" and "focus on but this app allowed" are both `false`.** If
   the user turns on Work Focus and allows Glance Bar in it (the reasonable
   thing for a status-bar app the user wants to keep using), the API reports
   not-focused — the same value as no Focus at all. The Windows payload's
   `active` is the aggregate QuietHours flag (`focus.rs:28-29`), and the
   frontend presents it as the system state. Mapping an app-relative,
   sharing-dependent boolean onto the same field would silently change the
   field's meaning per platform — with no way for the payload to say "focus
   is on, I just can't see it." That is precisely the kind of
   meaning-drift the STAGE6 rules exist to prevent
   (`docs/plans/STAGE6_CROSS_PLATFORM_DESIGN.md:15-18`), and it cannot be
   papered over with a different `code` without growing the vocabulary the
   frontend tests pin.
3. **No public mode identifier.** `INFocusStatus` exposes only `isFocused`
   (fetched docs above), so `profile` would be permanently empty even if the
   semantics were acceptable. (The private `FocusStatus` framework is
   reported to carry richer mode metadata such as `activeModeMetadata` —
   UNVERIFIED, not fetched, private framework, same category as the
   rejected private paths below.)
4. **No public control path.** There is no API to set or clear Focus. The
   Shortcuts "Set Focus" action driven via `shortcuts run` exists
   ([Automators Talk](https://talk.automators.fm/t/get-current-focus-mode-via-script/12423),
   [HeyFocus](https://heyfocus.com/blog/how-to-turn-on-mac-focus-mode-from-the-terminal)
   — search-corroborated), but it requires the user to author a shortcut and
   is not an API surface an app can assume. `controllable: false` on every
   path, with `stop_focus_session` keeping its explicit platform error
   (`focus.rs:80-83`), exactly as on Linux.

One honesty caveat on the other side: the exact behavior of `isFocused` on
real macOS hardware — including whether macOS actually implements the
allow-list semantics the sample describes — was not executed in this
environment (no Mac). The semantic mismatch argument rests on Apple's own
documentation and consistent community reports; if anyone ever contests the
verdict, hardware validation is where it would be settled.

## Q2 — Screen Time / FamilyControls: heavyweight approval, and no focus state exposed anyway

- **The framework does not expose Focus/DND state.** The complete
  FamilyControls symbol surface is authorization (`AuthorizationCenter`,
  `AuthorizationStatus`), the activity picker (`FamilyActivityPicker`,
  `FamilyActivitySelection`, `FamilyActivityData`, activity labels), and
  errors — with the framework abstract "Authorize your app to provide
  parental controls on a device"
  ([FamilyControls docs JSON](https://developer.apple.com/tutorials/data/documentation/familycontrols.json)).
  No type, property, or method reads Focus or Do Not Disturb state. The
  sibling frameworks (`ManagedSettings`, `DeviceActivity`) observe and
  restrict device/app usage; none of them reports Focus state.
- **The entitlement model is unacceptable for this app regardless.** Family
  Controls requires the `com.apple.developer.family-controls` entitlement,
  which "your Apple Developer Account Holder must request permission" for —
  Apple reviews the app and adds the entitlement as a managed capability
  ([Requesting the Family Controls entitlement](https://developer.apple.com/tutorials/data/documentation/familycontrols/requesting-the-family-controls-entitlement.json)).
  That is an approval-gated parental-controls capability, matching neither
  this app's category nor its distribution plans.
- **Verdict:** rejected on both grounds — it does not contain the observable
  we need, and its permission model is the opposite of a passive status-bar
  observation. Not a fallback for Q1's semantic mismatch.

## Q3 — Private/undocumented options: the DoNotDisturb DB files (documented here, not usable)

What exists (macOS 12+), all community-documented, none Apple-documented:

- **`~/Library/DoNotDisturb/DB/Assertions.json`** — "one record when a mode
  is on, empty when off" (`storeAssertionRecords` /
  `assertionDetails.assertionDetailsModeIdentifier`, identifiers like
  `com.apple.donotdisturb.mode.default`); **`ModeConfigurations.json`** —
  all configured modes with names, icons, colors, and triggers
  ([eugenehp/macos-focus README](https://raw.githubusercontent.com/eugenehp/macos-focus/main/README.md),
  [drewkerr gist](https://gist.github.com/drewkerr/0f2b61ce34e2b9e3ce0ec6a92ab05c18)).
  The brunerd script's Monterey branch treats a missing file, or a file
  without `storeAssertionRecords`, as DND-off
  ([doNotDisturb.sh](https://raw.githubusercontent.com/brunerd/macAdminTools/main/Scripts/doNotDisturb.sh)).
- **Known blind spots even for readers.** The gist documents that a Focus
  enabled on another device (e.g., an iPhone, where Focus syncs — Apple's
  guide confirms cross-device sync) shows in the Mac menu bar but is missed
  by the file read, and that non-time triggers (location, app-based) are not
  recoverable from the files — only manual assertions and time-based
  triggers can be reconstructed, and reconstructing schedules means
  re-implementing Apple's trigger evaluator. The author's own words: "not…
  much more than a hack" (fetched gist).
- **Permissions are contested.** The gist says Full Disk Access is required
  (observed for `osascript`/Shortcuts-hosted scripts, where the host
  process's FDA matters); the Rust library README says "No special
  entitlement required — the DB directory is user-owned" and "SIP does not
  protect these files". Both were fetched; the reconciliation (likely
  process-context-dependent — sandboxed or translocated helpers need FDA,
  plain user processes may not) is an inference and UNVERIFIED. What is
  consistent across sources: sandboxed apps cannot rely on it — "The DND
  file hacks are sandbox-unreachable"
  ([tesseract issue #304](https://github.com/spokvulcan/tesseract/issues/304)).
- **Fragility is structural.** The format is undocumented; the Rust library
  explicitly asks users to file issues with their DB file contents when
  Apple changes it, and its *write* path depends on undocumented internals
  (SF Symbol names, color tokens, "Apple internal numeric type" values,
  posting the private `_NSDoNotDisturbEnabledNotification` on the
  distributed notification center, and `launchctl`-restarting
  `donotdisturbd` and `ControlCenter` to make the UI notice) (fetched
  README). Whether the system itself posts that distributed notification on
  state changes is UNVERIFIED — it is cited here only as an undocumented
  signal third parties emit.
- **Writes are categorically out.** Crafting assertion records and
  restarting system daemons is mutation of undocumented system state —
  the exact category the macOS media module rejected MediaRemote for
  ("private MediaRemote framework … not App-Store-safe",
  `media/macos.rs:16-19`). Even read-only use is not App-Store-safe
  (sandbox-unreachable per tesseract) and not robust for Developer-ID
  distribution either (undocumented schema that has already changed at
  least across Monterey→current and demonstrably breaks under SDK updates —
  cf. the INFocusStatusCenter KVC breakage in Q1 for how SDK updates bite
  undocumented access patterns).
- **App Store relevance.** Glance Bar's macOS distribution has to survive
  the same scrutiny as the media capability: a capability whose read path
  can silently change semantics in a point release, underreports
  cross-device state, and requires filesystem access of contested TCC
  status is not a foundation for an `available` claim.

**Summary for Q3:** the files exist and the aggregate signal is *partially*
recoverable from them, which is why they are documented honestly here — but
every property that makes them workable for a script ("don't be a jerk"
pre-notification checks) makes them unusable for a status bar that must
report a truthful, stable aggregate.

## Q4 — Mapping onto the FocusAssistStatePayload contract

| Field | `INFocusStatusCenter` (the only documented option) | DB files (NOT supported — see Q3) | Notes |
| --- | --- | --- | --- |
| `active` | `isFocused` — app-relative, `nil`→error, `false` conflates "focus off" with "focus on, app allowed" | `storeAssertionRecords` present | Only the DB path approximates the aggregate, and it underreports synced/scheduled modes (Q3). No honest aggregate read exists. |
| `profile` | `""` (always) | mode name via a `ModeConfigurations.json` join | The public API exposes no mode identifier; the Windows provider also writes empty on error paths (`focus.rs:33`). Never invented. |
| `code` | `available` / `error` / `unsupported` | same | `unsupported`: gate off / API unavailable; `error`: authorized read failed or `nil` status; vocabulary pinned by the frontend tests (`realFocusProvider.test.ts:81-82`, `:212-213`). No new code values. |
| `controllable` | `false` on every path | `false` (writes rejected outright) | No public control API (Q1.4). `stop_focus_session` keeps returning the platform error (`focus.rs:80-83`). |
| `checked_at` | `unix_time_ms()` | `unix_time_ms()` | Same helper as Windows (`focus.rs:23`). |

Derived `NotificationSummaryPayload` comes free, as on Linux: the monitor
thread computes it from `active` (`monitoring/mod.rs:84-91`).

**Event emission.** Moot under the unsupported verdict, but for
completeness: no push signal is publicly documented for `INFocusStatus`
changes, so a macOS implementation would be a 2s poll (thread already
running, `lib.rs:350`, `monitoring/mod.rs:25`) re-reading a cheap
process-singleton property — the same cost shape as the Windows registry
poll. Authorization status would need to be cached and re-checked on
`unsupported`/`denied` transitions rather than re-prompted per poll.
UNVERIFIED: per-poll cost of the Intents-framework read on a real Mac.

**The honest mapping verdict: no mapping exists today.** `active` must keep
meaning "the system's aggregate quiet mode" on every platform; macOS offers
either an app-relative approximation that cannot distinguish "off" from "on
but allowed" (Q1), or an undocumented file format that underreports exactly
the cross-device and scheduled states real users rely on (Q3). Shipping
either under the existing field would be a per-platform meaning change,
which this repo's design rules and the frontend test contract both forbid.

## Q5 — Privacy: the boundary would be satisfiable — privacy is not the blocker

- The payload crossing the boundary is `active` + `code` + `controllable` +
  `checked_at` (+ an always-empty `profile`): a single system quiet-mode
  boolean and bounded enums. The repo rule — "IPC exposes only coarse
  percentages and bounded enums. Never expose process lists, paths,
  credentials, usernames, or raw private payloads." (`AGENTS.md:47`) — is
  satisfiable by construction.
- The privacy checklist's forbidden facts are not touched: focus state is
  not notification text, metadata, or notification-center contents; no app
  identities are read or emitted (the app-relative semantics of
  `isFocused` concern *this app*, not third-party app usage)
  (`docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md:28-38`).
- Diagnostics follow the bounded-code rules (`available`/`error`/
  `unsupported`, no raw payloads) — the checklist's error-summary section
  and its preference for "short codes, bounded messages, and boolean or
  enum facts" (`docs/decisions/v0.8_SYSTEM_STATUS_PRIVACY_CHECKLIST.md:46-59`).
- The privacy-*adjacent* cost is real but different: focus-status access is
  user-authorized and usage-description-gated (Q1) — a visible permission
  prompt that neither the Windows registry read nor any Linux path needs.
  For an observation this coarse, that prompt is a product decision, not a
  privacy-boundary violation. Note the asymmetry for honesty's sake: on
  macOS the user would grant a permission for a capability that could not
  truthfully report the aggregate state anyway.

## Recommendation

**Verdict: the Focus capability stays unsupported on macOS.** The ask
anticipates this being a valid outcome, and it is the one the evidence
supports. **No `MACOS_FOCUS_VALIDATED` gate is named**, because the
condition for naming one — a plausible supported path to the contract's
observable — is not met:

1. The only documented API (`INFocusStatusCenter`, macOS 12+) reports an
   app-relative, sharing- and allow-list-dependent boolean that cannot
   distinguish "focus off" from "focus on with this app allowed" — it cannot
   fill `active` honestly (Q1).
2. FamilyControls/Screen Time does not expose focus state at all and its
   entitlement is Apple-review-gated for parental-control apps (Q2).
3. The `~/Library/DoNotDisturb/DB/` JSON files approximate the aggregate
   but are undocumented, sandbox-unreachable, contested on permissions, and
   structurally blind to cross-device and non-time-triggered modes — the
   same fragility category the macOS media module rejected MediaRemote for
   (Q3; `media/macos.rs:16-19`).

**Consequence for the codebase: none.** Today's macOS behavior is already
the honest terminal state — the stub payload (`focus.rs:52-61`), the
false notification summary (`focus.rs:95-101`), and the 2s stub poll
(`lib.rs:350`) need no stub slice, no gate, and no new module. This note is
a documentation-only change. That is a different shape from the Linux
verdict (which named `LINUX_FOCUS_VALIDATED` because real read paths existed
there): on macOS the honest answer to "can this be observed?" is currently
"not as defined."

**What would reopen the verdict** (recorded for honesty, not a plan):

- Apple documents an *aggregate* focus-state read (watch Intents and
  UserNotifications release notes; a public equivalent of the private
  `FocusStatus` center would do it).
- A product decision that the *app-relative* fact — "does Focus currently
  suppress this app's notifications?" — is worth surfacing on its own
  terms. That is a legitimate feature, but it is a different observable and
  would require an explicit contract renegotiation (new field semantics or
  vocabulary), a permission prompt with usage description, the Communication
  Notifications capability, real-hardware validation of allow-list and
  sharing semantics across macOS 12→current, and the `MACOS_MEDIA_VALIDATED`
  gate pattern (`media/macos.rs:62`, `:102-104`) as the implementation
  mechanism. Per the ask, this note does not name that gate.

## Open questions / UNVERIFIED carried forward

- SO 71807412's exact Monterey-era behavior report ("key always returns 1"):
  search-corroborated only; the page could not be fetched from this
  environment (403 / StackPrinter unavailable). The version split itself is
  verified from fetched sources (brunerd, macos-focus README).
- `isFocused` behavior on real macOS hardware (authorization dialog flow,
  "Share Focus Status" toggle location on macOS, allow-list semantics,
  nil-vs-false when unauthorized): documented semantics are quoted from
  Apple sources; runtime behavior was not executed here (no Mac).
- Whether the Communication Notifications entitlement is required for focus
  reads on macOS (Home Assistant's Code=1004 log vs. the maintainer's
  dispute), and whether ITMS-90894 applies to Developer-ID distribution.
- Whether the system itself posts `_NSDoNotDisturbEnabledNotification` on
  Focus changes (only third-party emission is documented).
- Full-Disk-Access requirements for direct DB-file reads by a regular
  non-sandboxed user process (drewkerr and macos-focus README conflict;
  reconciliation is an inference).
- Private `FocusStatus` framework metadata (`activeModeMetadata`): reported
  in search results only; not fetched, not public.
- Shortcuts' "Get Current Focus" / "Is Focus On" action availability per OS
  version (search-corroborated community threads only); relevant only to
  the non-API `shortcuts run` path, which requires user-authored shortcuts
  and is not an app-ownable mechanism.
