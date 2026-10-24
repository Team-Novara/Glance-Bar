// ---------------------------------------------------------------------------
// Linux Focus observation — GNOME GSettings / KDE D-Bus, behind the STAGE6
// validation gate.
// ---------------------------------------------------------------------------
// Observation-only: maps each desktop's own "notifications currently
// silenced" state onto the bounded FocusAssistStatePayload shape. No control
// is implemented on Linux — `controllable` is false on every path, and
// `stop_focus_session` keeps returning its existing error
// (commands/focus.rs).
//
// Mechanisms (docs/plans/LINUX_FOCUS_FEASIBILITY.md):
//
// - GNOME-family sessions: `org.gnome.desktop.notifications show-banners`
//   read in-process through the gio crate — the same GSettings key GNOME
//   Shell itself equates with Do Not Disturb (`active = !show-banners`,
//   gnome-shell js/ui/dateMenu.js). Never shells out to `gsettings`.
// - KDE-family sessions: the read-only `Inhibited` property on
//   `org.freedesktop.Notifications` (Plasma's aggregate DND state) via zbus
//   on the session bus, with a cached connection and a bounded ~1s method
//   timeout (media/linux.rs pattern).
// - Unknown desktops: no mechanism is probed at all — bounded `unsupported`.
//
// Capability gate (STAGE6_CROSS_PLATFORM_DESIGN.md: a capability must keep
// reporting unsupported until it has been validated on real target
// hardware): the implementation below is complete, but
// `LINUX_FOCUS_VALIDATED` is `false`, so the read returns exactly the
// bounded `unsupported` payload of the pre-implementation stub — no
// environment probing, no gio access, no bus connection. Flip the const to
// `true` only after recording validation evidence on a real Linux desktop;
// that flip is the single switch that enables the capability end to end
// (the command layer and the focus monitor thread both route through
// `commands::focus::read_focus_assist_state`).
//
// Privacy: a single quiet-mode boolean plus bounded enums cross the Tauri
// boundary — no D-Bus error strings, schema names, environment values, or
// file contents ever leave this module.

use crate::types::FocusAssistStatePayload;

/// STAGE6 validation gate for the Linux focus capability. `false` = report
/// the bounded `unsupported` payload (default until real-desktop
/// validation); `true` = run the GNOME / KDE observation paths implemented
/// below. Flip only together with recorded real-desktop validation evidence
/// (and the gate test at the bottom of this file).
const LINUX_FOCUS_VALIDATED: bool = false;

/// The bounded `unsupported` payload — field-for-field identical to the
/// pre-implementation stub (the old `#[cfg(not(windows))]` branch of
/// `read_focus_assist_state` in commands/focus.rs), so gate-off behavior is
/// exactly what earlier builds reported.
pub(super) fn unsupported_state(checked_at: u64) -> FocusAssistStatePayload {
    FocusAssistStatePayload {
        active: false,
        profile: String::new(),
        code: "unsupported",
        controllable: false,
        checked_at,
    }
}

/// The bounded `error` payload — mirrors the Windows read-failure paths in
/// `commands/focus.rs`: the surface exists but could not be read, so
/// nothing is claimed about `active` and control stays unavailable.
pub(super) fn error_state(checked_at: u64) -> FocusAssistStatePayload {
    FocusAssistStatePayload {
        active: false,
        profile: String::new(),
        code: "error",
        controllable: false,
        checked_at,
    }
}

// ---------------------------------------------------------------------------
// Pure observation model — no gio/zbus types, unit-tested below
// ---------------------------------------------------------------------------

/// What the GNOME mechanism observed. Pure data — no gio types — so the
/// payload mapping is testable without `GSettings`. There is deliberately no
/// read-failure variant: past the schema guard the gio getter is infallible
/// (`g_settings_get_boolean` returns a plain bool, no `GError`), so the only
/// non-success outcome is a missing surface.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum GnomeObservation {
    /// `show-banners` read successfully; Do Not Disturb is active iff false.
    ShowBanners(bool),
    /// The schema or its `show-banners` key does not exist in this session
    /// (non-GNOME session, pre-3.26 schema): no observable GNOME surface.
    SchemaMissing,
}

/// What the KDE mechanism observed. Pure data — no zbus types.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum KdeObservation {
    /// `Inhibited` read successfully.
    Inhibited(bool),
    /// No daemon exports the property in this session (name unowned,
    /// property/interface absent): no observable Plasma DND surface.
    SurfaceMissing,
    /// The surface exists — or cannot be ruled out — but the read failed.
    ReadFailed,
}

/// Map a GNOME observation onto the payload. GNOME Shell itself derives Do
/// Not Disturb as `!show-banners` (js/ui/dateMenu.js), so the boolean is
/// inverted; `profile` stays empty (Linux has no profile concept) and
/// `controllable` stays false (no Linux control is implemented).
pub(super) fn map_gnome(observation: GnomeObservation, checked_at: u64) -> FocusAssistStatePayload {
    match observation {
        GnomeObservation::ShowBanners(show_banners) => FocusAssistStatePayload {
            active: !show_banners,
            profile: String::new(),
            code: "available",
            controllable: false,
            checked_at,
        },
        GnomeObservation::SchemaMissing => unsupported_state(checked_at),
    }
}

/// Map a KDE observation onto the payload; `Inhibited` is already the
/// shell's aggregate "notifications currently silenced" state.
pub(super) fn map_kde(observation: KdeObservation, checked_at: u64) -> FocusAssistStatePayload {
    match observation {
        KdeObservation::Inhibited(inhibited) => FocusAssistStatePayload {
            active: inhibited,
            profile: String::new(),
            code: "available",
            controllable: false,
            checked_at,
        },
        KdeObservation::SurfaceMissing => unsupported_state(checked_at),
        KdeObservation::ReadFailed => error_state(checked_at),
    }
}

/// The desktop mechanisms Glance Bar can observe, in the order a plan below
/// tries them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum FocusMechanism {
    /// GNOME-family session: the `GSettings` `show-banners` boolean.
    GnomeSettings,
    /// KDE-family session: the `Inhibited` D-Bus property.
    KdeDbus,
}

static GNOME_THEN_KDE: [FocusMechanism; 2] =
    [FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus];
static KDE_ONLY: [FocusMechanism; 1] = [FocusMechanism::KdeDbus];
static NO_MECHANISM: [FocusMechanism; 0] = [];

/// Choose what to observe for this session, conservatively.
///
/// `XDG_CURRENT_DESKTOP` (colon-separated) is authoritative: its first
/// recognized entry decides. When it is set but names no known desktop, the
/// answer is "no mechanism" — `DESKTOP_SESSION` is only consulted when
/// `XDG_CURRENT_DESKTOP` is unset or empty, because a session advertising,
/// say, XFCE must not be talked into reporting a GNOME key that merely
/// happens to be installed (gsettings-desktop-schemas ships with the GTK
/// stack on many non-GNOME systems, so schema presence is meaningless
/// there).
///
/// Plans:
///
/// - GNOME family → [`GNOME_THEN_KDE`]: the `GSettings` key first; the KDE
///   probe is only reached when the schema is missing, and it can then only
///   report another absent surface (GNOME's own notification daemon exports
///   no `Inhibited` property).
/// - KDE family → [`KDE_ONLY`]: never probe the GNOME schema on KDE (see
///   the installed-everywhere caveat above — reading its default
///   `show-banners = true` would masquerade as an observation).
/// - Anything else → [`NO_MECHANISM`]: unknown desktops stay `unsupported`
///   without touching gio or the bus.
pub(super) fn mechanism_plan(
    xdg_current_desktop: Option<&str>,
    desktop_session: Option<&str>,
) -> &'static [FocusMechanism] {
    if let Some(xdg) = xdg_current_desktop.filter(|value| !value.is_empty()) {
        return xdg.split(':').find_map(entry_plan).unwrap_or(&NO_MECHANISM);
    }
    if let Some(session) = desktop_session.filter(|value| !value.is_empty()) {
        return session_plan(session);
    }
    &NO_MECHANISM
}

/// One `XDG_CURRENT_DESKTOP` entry → the plan for that desktop family, if
/// recognized. Matching is case-sensitive on the standard spellings: an
/// unusual casing stays unknown (conservative).
fn entry_plan(entry: &str) -> Option<&'static [FocusMechanism]> {
    if entry == "GNOME" || entry.starts_with("GNOME-") {
        return Some(&GNOME_THEN_KDE);
    }
    if entry == "KDE" || entry.starts_with("KDE-") {
        return Some(&KDE_ONLY);
    }
    None
}

/// Legacy `DESKTOP_SESSION` fallback (only reached when
/// `XDG_CURRENT_DESKTOP` is absent): recognize the standard session names,
/// nothing else.
fn session_plan(session: &str) -> &'static [FocusMechanism] {
    let lowered = session.to_lowercase();
    if lowered.contains("gnome") {
        &GNOME_THEN_KDE
    } else if lowered.contains("plasma") || lowered.contains("kde") {
        &KDE_ONLY
    } else {
        &NO_MECHANISM
    }
}

/// Walk the plan, mapping each observation onto the payload.
///
/// - The first mechanism with a definitive answer wins: an available read,
///   or a failed read of a *present* surface (reported as `error` — a
///   present surface's failure must not be masked by another mechanism's
///   state).
/// - Only a *missing surface* falls through to the next mechanism; when the
///   plan is exhausted (or empty), the bounded `unsupported` payload wins.
/// - The observers are called lazily, at most once each, in plan order: an
///   unknown desktop probes nothing, and a KDE-only plan never touches gio.
pub(super) fn resolve_plan(
    plan: &[FocusMechanism],
    mut gnome: impl FnMut() -> GnomeObservation,
    mut kde: impl FnMut() -> KdeObservation,
    checked_at: u64,
) -> FocusAssistStatePayload {
    let mut exhausted = unsupported_state(checked_at);
    for mechanism in plan {
        match mechanism {
            FocusMechanism::GnomeSettings => match gnome() {
                GnomeObservation::SchemaMissing => {
                    exhausted = map_gnome(GnomeObservation::SchemaMissing, checked_at);
                }
                definitive @ GnomeObservation::ShowBanners(_) => {
                    return map_gnome(definitive, checked_at);
                }
            },
            // Every non-empty plan ends with the KDE probe (or is KDE-only),
            // so its answer is always the one reported.
            FocusMechanism::KdeDbus => return map_kde(kde(), checked_at),
        }
    }
    exhausted
}

// ---------------------------------------------------------------------------
// Gated read
// ---------------------------------------------------------------------------

/// Gated entry point for the command layer (the `#[cfg(target_os = "linux")]`
/// branch of `read_focus_assist_state` in commands/focus.rs). While the gate
/// is off this is exactly the old stub: no environment probe, no gio, no bus.
pub(crate) fn read_focus_assist_state() -> FocusAssistStatePayload {
    read_state_at(crate::unix_time_ms())
}

/// [`read_focus_assist_state`] with the timestamp injected, so the gate-off
/// contract test can pin the payload field for field.
fn read_state_at(checked_at: u64) -> FocusAssistStatePayload {
    if !LINUX_FOCUS_VALIDATED {
        return unsupported_state(checked_at);
    }
    let xdg_current_desktop = std::env::var("XDG_CURRENT_DESKTOP").ok();
    let desktop_session = std::env::var("DESKTOP_SESSION").ok();
    resolve_plan(
        mechanism_plan(xdg_current_desktop.as_deref(), desktop_session.as_deref()),
        backend::observe_gnome,
        backend::observe_kde,
        checked_at,
    )
}

// ---------------------------------------------------------------------------
// Platform observers. Everything that touches gio or zbus lives here; both
// are Linux-target dependencies and this whole module compiles only on
// Linux (declared `#[cfg(target_os = "linux")]` in commands/focus.rs).
// ---------------------------------------------------------------------------
mod backend {
    use super::{GnomeObservation, KdeObservation};
    use gio::prelude::SettingsExt;
    use std::sync::{Mutex, PoisonError};
    use std::time::Duration;

    // --- GNOME: org.gnome.desktop.notifications show-banners ---

    /// The `GSettings` schema holding the system-level DND key
    /// (gsettings-desktop-schemas, path /org/gnome/desktop/notifications/).
    const GNOME_NOTIFICATIONS_SCHEMA: &str = "org.gnome.desktop.notifications";
    /// The key GNOME Shell equates with Do Not Disturb (`active = !value`).
    const GNOME_SHOW_BANNERS_KEY: &str = "show-banners";

    /// Read `show-banners` in-process. The schema-source lookup guard comes
    /// first and is mandatory: constructing a `GSettings` object for a
    /// missing schema is a fatal C-level error (`g_settings_new` aborts; the
    /// binding panics), and on non-GNOME sessions the schema is absent —
    /// that must map to a bounded `unsupported`, never a panic.
    pub(super) fn observe_gnome() -> GnomeObservation {
        let Some(source) = gio::SettingsSchemaSource::default() else {
            return GnomeObservation::SchemaMissing;
        };
        let Some(schema) = source.lookup(GNOME_NOTIFICATIONS_SCHEMA, true) else {
            return GnomeObservation::SchemaMissing;
        };
        if !schema.has_key(GNOME_SHOW_BANNERS_KEY) {
            // Older schema without the DND key: no observable surface.
            return GnomeObservation::SchemaMissing;
        }
        // The schema exists, so construction cannot reach the
        // missing-schema error path; getters are synchronous and need no
        // main loop.
        let settings = gio::Settings::new_full(&schema, None::<&gio::SettingsBackend>, None);
        GnomeObservation::ShowBanners(settings.boolean(GNOME_SHOW_BANNERS_KEY))
    }

    // --- KDE: org.freedesktop.Notifications Inhibited ---

    /// Well-known name plasmashell claims for the notification daemon;
    /// libnotificationmanager exports the read-only `Inhibited` property
    /// there (with `EmitsChangedSignal` true).
    const KDE_NOTIFICATIONS_NAME: &str = "org.freedesktop.Notifications";
    const KDE_NOTIFICATIONS_PATH: &str = "/org/freedesktop/Notifications";
    const KDE_NOTIFICATIONS_INTERFACE: &str = "org.freedesktop.Notifications";
    const KDE_INHIBITED_PROPERTY: &str = "Inhibited";

    /// Per-call D-Bus timeout, enforced connection-wide. Bounded so a hung
    /// daemon cannot stall the 2s focus poll loop: every call below fails
    /// after ~1s instead of blocking for the D-Bus default (25s).
    const DBUS_METHOD_TIMEOUT: Duration = Duration::from_secs(1);

    /// Process-wide cached session-bus connection (media/linux.rs pattern).
    /// Serializing reads on one mutex is fine: every D-Bus exchange is
    /// bounded by [`DBUS_METHOD_TIMEOUT`]. `pub(super)` so the gate-off test
    /// can prove the gated read never touches the bus.
    pub(super) static CONNECTION: Mutex<Option<zbus::blocking::Connection>> = Mutex::new(None);

    /// D-Bus error names that mean "the `Inhibited` surface does not exist
    /// in this session": the notification name is unowned (no Plasma
    /// daemon), or the object/interface/property is missing (dunst, mako,
    /// xfce4-notifyd and friends do not export `Inhibited`). These are the
    /// published `org.freedesktop.DBus.Error.*` names.
    const ABSENT_SURFACE_ERRORS: [&str; 5] = [
        "org.freedesktop.DBus.Error.ServiceUnknown",
        "org.freedesktop.DBus.Error.UnknownObject",
        "org.freedesktop.DBus.Error.UnknownInterface",
        "org.freedesktop.DBus.Error.UnknownProperty",
        "org.freedesktop.DBus.Error.UnknownMethod",
    ];

    /// Classify a method-error name: the absent-surface family reports a
    /// missing surface (bounded `unsupported`); everything else — transport
    /// failures, timeouts, access errors — is a present-or-unknown surface
    /// that failed to read (bounded `error`).
    pub(super) fn classify_kde_failure_name(error_name: Option<&str>) -> KdeObservation {
        match error_name {
            Some(name) if ABSENT_SURFACE_ERRORS.contains(&name) => KdeObservation::SurfaceMissing,
            _ => KdeObservation::ReadFailed,
        }
    }

    /// Map a zbus failure onto a KDE observation. Method errors carry the
    /// D-Bus error name; anything else (connect, handshake, I/O, the
    /// timeouts enforced by [`DBUS_METHOD_TIMEOUT`]) is a read failure.
    fn classify_kde_error(error: &zbus::Error) -> KdeObservation {
        match error {
            zbus::Error::MethodError(name, _, _) => classify_kde_failure_name(Some(name.as_str())),
            // Typed mappings of the same well-known names, should a zbus
            // layer convert before we see the raw reply.
            zbus::Error::FDO(boxed) => match boxed.as_ref() {
                zbus::fdo::Error::ServiceUnknown(_)
                | zbus::fdo::Error::UnknownObject(_)
                | zbus::fdo::Error::UnknownInterface(_)
                | zbus::fdo::Error::UnknownProperty(_)
                | zbus::fdo::Error::UnknownMethod(_) => KdeObservation::SurfaceMissing,
                _ => KdeObservation::ReadFailed,
            },
            _ => KdeObservation::ReadFailed,
        }
    }

    /// Connect to the session bus with a bounded per-call method timeout.
    fn session_connection() -> zbus::Result<zbus::blocking::Connection> {
        zbus::blocking::connection::Builder::session()?
            .method_timeout(DBUS_METHOD_TIMEOUT)
            .build()
    }

    /// Return the cached session-bus connection, (re)building it on demand.
    /// The connection survives across reads and is rebuilt after a
    /// bus-level failure (see [`observe_kde`], which drops the cache when
    /// the bus stops answering).
    fn ensure_connection(
        cache: &mut Option<zbus::blocking::Connection>,
    ) -> Option<zbus::blocking::Connection> {
        if let Some(conn) = cache.as_ref() {
            return Some(conn.clone());
        }
        let fresh = session_connection().ok()?;
        *cache = Some(fresh.clone());
        Some(fresh)
    }

    /// Read Plasma's aggregate `Inhibited` property over the session bus.
    /// Never calls `Inhibit`/`UnInhibit` — those are mutations, not
    /// observations.
    pub(super) fn observe_kde() -> KdeObservation {
        // Poisoning only happens after a panic while holding the lock; the
        // D-Bus path is panic-free, and recovering the (possibly stale)
        // connection beats failing every future read.
        let mut cache = CONNECTION.lock().unwrap_or_else(PoisonError::into_inner);
        let Some(conn) = ensure_connection(&mut cache) else {
            // Session bus unreachable: the surface cannot be read.
            return KdeObservation::ReadFailed;
        };

        // Property caching must stay off: this is a poll observer, so every
        // read has to be a fresh `Properties.Get` call, not a signal-driven
        // cache that a quiet daemon would leave stale.
        let proxy = zbus::blocking::proxy::Builder::<zbus::blocking::Proxy>::new(&conn)
            .destination(KDE_NOTIFICATIONS_NAME)
            .and_then(|builder| builder.path(KDE_NOTIFICATIONS_PATH))
            .and_then(|builder| builder.interface(KDE_NOTIFICATIONS_INTERFACE))
            .map(|builder| builder.cache_properties(zbus::proxy::CacheProperties::No))
            .and_then(zbus::blocking::proxy::Builder::build);
        let Ok(proxy) = proxy else {
            // The bus itself just answered, so keep the connection; only
            // the proxy could not be built (constant paths, unexpected).
            return KdeObservation::ReadFailed;
        };

        match proxy.get_property::<bool>(KDE_INHIBITED_PROPERTY) {
            Ok(inhibited) => KdeObservation::Inhibited(inhibited),
            Err(error) => {
                let observation = classify_kde_error(&error);
                if observation == KdeObservation::ReadFailed {
                    // The connection may be broken (timeout, disconnect);
                    // drop the cache so the next read reconnects from
                    // scratch. Absent-surface errors keep it: the bus
                    // answered.
                    *cache = None;
                }
                observation
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Unit tests — pure logic only: no GSettings access and no session-bus
// connection is made anywhere here, so they pass in CI environments without
// a desktop session. The KDE error-name classification is Linux-specific
// (it classifies zbus errors), hence the two `#[cfg(target_os = "linux")]`
// tests below.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::{
        error_state, map_gnome, map_kde, mechanism_plan, read_state_at, resolve_plan,
        unsupported_state, FocusMechanism, GnomeObservation, KdeObservation, LINUX_FOCUS_VALIDATED,
    };

    // FocusAssistStatePayload carries no PartialEq, so payload contracts
    // assert field by field (media/linux.rs precedent).

    #[test]
    fn gate_keeps_the_capability_unsupported_by_default() {
        // STAGE6 contract: until real-desktop validation is recorded, the
        // focus read must return the bounded unsupported payload — the old
        // stub, field for field — and must do so without probing the
        // environment, gio, or the session bus (the gate check precedes all
        // of that). Flipping LINUX_FOCUS_VALIDATED requires updating this
        // test together with the validation evidence.
        assert!(!LINUX_FOCUS_VALIDATED);
        let state = read_state_at(1_234);
        assert!(!state.active);
        assert_eq!(state.profile, "");
        assert_eq!(state.code, "unsupported");
        assert!(!state.controllable);
        assert_eq!(state.checked_at, 1_234);
        // No mechanism ran, so no session-bus connection was ever made.
        #[cfg(target_os = "linux")]
        assert!(
            super::backend::CONNECTION
                .lock()
                .expect("connection cache")
                .is_none(),
            "gate-off read must not touch the session bus"
        );
    }

    #[test]
    fn classifies_gnome_sessions_to_gnome_then_kde() {
        for desktop in ["GNOME", "ubuntu:GNOME", "GNOME-Classic:GNOME", "pop:GNOME"] {
            assert_eq!(
                mechanism_plan(Some(desktop), None),
                [FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus],
                "desktop: {desktop}"
            );
        }
    }

    #[test]
    fn classifies_kde_sessions_to_kde_only() {
        for desktop in ["KDE", "KDE-Flashback"] {
            assert_eq!(
                mechanism_plan(Some(desktop), None),
                [FocusMechanism::KdeDbus],
                "desktop: {desktop}"
            );
        }
    }

    #[test]
    fn prefers_xdg_current_desktop_over_desktop_session() {
        // XDG is authoritative even when DESKTOP_SESSION disagrees: on KDE,
        // gsettings-desktop-schemas is often installed as a GTK-stack side
        // effect, so a GNOME-schema probe there could report the schema's
        // default as if it were this session's DND state.
        assert_eq!(
            mechanism_plan(Some("KDE"), Some("gnome")),
            [FocusMechanism::KdeDbus]
        );
        assert_eq!(
            mechanism_plan(Some("GNOME"), Some("plasma")),
            [FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus]
        );
    }

    #[test]
    fn falls_back_to_desktop_session_only_without_xdg_current_desktop() {
        assert_eq!(
            mechanism_plan(None, Some("gnome")),
            [FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus]
        );
        assert_eq!(
            mechanism_plan(None, Some("plasma")),
            [FocusMechanism::KdeDbus]
        );
        assert_eq!(
            mechanism_plan(None, Some("/usr/share/xsessions/plasma")),
            [FocusMechanism::KdeDbus]
        );
        assert_eq!(
            mechanism_plan(None, Some("kde-plasma")),
            [FocusMechanism::KdeDbus]
        );
        // An empty XDG value counts as absent.
        assert_eq!(
            mechanism_plan(Some(""), Some("plasma")),
            [FocusMechanism::KdeDbus]
        );
    }

    #[test]
    fn unknown_desktops_plan_no_mechanism() {
        assert_eq!(mechanism_plan(Some("XFCE"), None), []);
        // A set-but-unrecognized XDG value must NOT fall through to
        // DESKTOP_SESSION (an XFCE session that ships a GNOME schema would
        // otherwise report that meaningless key).
        assert_eq!(mechanism_plan(Some("XFCE"), Some("gnome")), []);
        assert_eq!(mechanism_plan(Some("LXQt"), Some("lxqt")), []);
        assert_eq!(mechanism_plan(None, None), []);
        assert_eq!(mechanism_plan(None, Some("default")), []);
        assert_eq!(mechanism_plan(None, Some("")), []);
    }

    #[test]
    fn maps_gnome_show_banners_with_shell_inversion() {
        // GNOME Shell equates DND with !show-banners (dateMenu.js).
        let banners_on = map_gnome(GnomeObservation::ShowBanners(true), 5_000);
        assert!(!banners_on.active);
        assert_eq!(banners_on.code, "available");
        assert_eq!(banners_on.profile, "");
        assert!(!banners_on.controllable);
        assert_eq!(banners_on.checked_at, 5_000);

        let dnd = map_gnome(GnomeObservation::ShowBanners(false), 5_001);
        assert!(dnd.active);
        assert_eq!(dnd.code, "available");
        assert!(!dnd.controllable);
    }

    #[test]
    fn maps_kde_inhibited_directly() {
        let inhibited = map_kde(KdeObservation::Inhibited(true), 6_000);
        assert!(inhibited.active);
        assert_eq!(inhibited.code, "available");
        assert_eq!(inhibited.profile, "");
        assert!(!inhibited.controllable);
        assert_eq!(inhibited.checked_at, 6_000);

        assert!(!map_kde(KdeObservation::Inhibited(false), 6_001).active);
    }

    #[test]
    fn maps_missing_surfaces_to_the_unsupported_payload() {
        for state in [
            map_gnome(GnomeObservation::SchemaMissing, 7_000),
            map_kde(KdeObservation::SurfaceMissing, 7_000),
            unsupported_state(7_000),
        ] {
            assert!(!state.active);
            assert_eq!(state.profile, "");
            assert_eq!(state.code, "unsupported");
            assert!(!state.controllable);
            assert_eq!(state.checked_at, 7_000);
        }
    }

    #[test]
    fn maps_present_surface_read_failures_to_the_error_payload() {
        // Mirrors the Windows error paths (commands/focus.rs): active stays
        // false, nothing is invented, controllable stays false. The KDE
        // read is where real failure modes live (transport, timeout, typed
        // properties); the GNOME getter is infallible past its guard.
        for state in [
            map_kde(KdeObservation::ReadFailed, 8_000),
            error_state(8_000),
        ] {
            assert!(!state.active);
            assert_eq!(state.profile, "");
            assert_eq!(state.code, "error");
            assert!(!state.controllable);
            assert_eq!(state.checked_at, 8_000);
        }
    }

    #[test]
    fn resolves_the_first_definitive_observation_in_plan_order() {
        let state = resolve_plan(
            &[FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus],
            || GnomeObservation::ShowBanners(false),
            || unreachable!("kde observer must not run when gnome answers"),
            9_000,
        );
        assert!(state.active);
        assert_eq!(state.code, "available");
    }

    #[test]
    fn kde_only_plans_never_probe_the_gnome_schema() {
        let state = resolve_plan(
            &[FocusMechanism::KdeDbus],
            || unreachable!("gnome observer must not run in a kde plan"),
            || KdeObservation::Inhibited(true),
            9_100,
        );
        assert!(state.active);
        assert_eq!(state.code, "available");
    }

    #[test]
    fn falls_through_to_kde_only_when_the_gnome_schema_is_missing() {
        let state = resolve_plan(
            &[FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus],
            || GnomeObservation::SchemaMissing,
            || KdeObservation::Inhibited(true),
            9_200,
        );
        assert!(state.active);
        assert_eq!(state.code, "available");

        // A missing GNOME surface followed by a missing KDE surface is the
        // bounded unsupported payload, never a fabricated state.
        let state = resolve_plan(
            &[FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus],
            || GnomeObservation::SchemaMissing,
            || KdeObservation::SurfaceMissing,
            9_201,
        );
        assert!(!state.active);
        assert_eq!(state.code, "unsupported");
    }

    #[test]
    fn reports_a_kde_read_failure_rather_than_unsupported() {
        // A missing GNOME surface falls through, and a KDE read failure on
        // top of it is an honest `error`, not a silent `unsupported`.
        let state = resolve_plan(
            &[FocusMechanism::GnomeSettings, FocusMechanism::KdeDbus],
            || GnomeObservation::SchemaMissing,
            || KdeObservation::ReadFailed,
            9_300,
        );
        assert!(!state.active);
        assert_eq!(state.code, "error");
        assert_eq!(state.checked_at, 9_300);
    }

    #[test]
    fn empty_plans_report_unsupported_without_probing() {
        let state = resolve_plan(
            &[],
            || unreachable!("no observer may run for an empty plan"),
            || unreachable!("no observer may run for an empty plan"),
            9_400,
        );
        assert!(!state.active);
        assert_eq!(state.code, "unsupported");
        assert_eq!(state.checked_at, 9_400);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn classifies_well_known_absence_errors_as_a_missing_surface() {
        use super::backend::classify_kde_failure_name;
        for name in [
            "org.freedesktop.DBus.Error.ServiceUnknown",
            "org.freedesktop.DBus.Error.UnknownObject",
            "org.freedesktop.DBus.Error.UnknownInterface",
            "org.freedesktop.DBus.Error.UnknownProperty",
            "org.freedesktop.DBus.Error.UnknownMethod",
        ] {
            assert_eq!(
                classify_kde_failure_name(Some(name)),
                KdeObservation::SurfaceMissing,
                "error name: {name}"
            );
        }
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn classifies_transport_and_timeout_failures_as_read_failures() {
        use super::backend::classify_kde_failure_name;
        assert_eq!(classify_kde_failure_name(None), KdeObservation::ReadFailed);
        assert_eq!(
            classify_kde_failure_name(Some("org.freedesktop.DBus.Error.Timeout")),
            KdeObservation::ReadFailed
        );
        assert_eq!(
            classify_kde_failure_name(Some("org.freedesktop.DBus.Error.AccessDenied")),
            KdeObservation::ReadFailed
        );
        // Near-misses stay read failures: only the exact published names
        // mean "surface absent".
        assert_eq!(
            classify_kde_failure_name(Some("org.freedesktop.DBus.Error.UnknownPropertyX")),
            KdeObservation::ReadFailed
        );
    }
}
