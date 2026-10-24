// ---------------------------------------------------------------------------
// Linux Media Session — MPRIS (D-Bus) observation via zbus (Stage 6).
// ---------------------------------------------------------------------------
// Observation-only: reads the `org.mpris.MediaPlayer2.Player` properties of a
// single, deterministically selected player and maps them onto the bounded
// MediaSessionStatus shape. Playback control stays Windows-only.
//
// Capability gate (STAGE6_CROSS_PLATFORM_DESIGN.md: a capability must keep
// reporting unsupported until it has been validated on real target hardware):
// the implementation below is complete, but `MPRIS_VALIDATED` is `false`, so
// `read_status` returns the same bounded `unsupported` payload as the old
// stub. Flip the const to `true` only after recording validation evidence on
// a real Linux desktop; that flip is the single switch that enables the
// capability end to end (the command layer routes through this provider).
//
// Privacy: only bounded MediaSessionStatus fields cross the Tauri boundary —
// coarse playback state, 0-100 progress, millisecond timeline facts, and
// title/artist clamped to `TEXT_CAP_CHARS` characters. Bus names (beyond the
// in-module selection), URLs (`xesam:url` is never read), and raw metadata
// never leave this module.

use super::PlatformMediaProvider;
use crate::types::MediaSessionStatus;

/// STAGE6 validation gate for the Linux MPRIS capability. `false` = report
/// `unsupported` (default until real-desktop validation); `true` = run the
/// full observation path implemented in [`mpris`].
const MPRIS_VALIDATED: bool = false;

/// The bounded `unsupported` payload — field-for-field identical to the
/// pre-implementation stub, so gate-off behavior is exactly what earlier
/// builds reported (and what the command layer returns on other platforms).
fn unsupported_status(checked_at: u64) -> MediaSessionStatus {
    MediaSessionStatus {
        available: false,
        playback_status: "unsupported",
        progress: 0,
        position_ms: None,
        duration_ms: None,
        title: String::new(),
        artist: String::new(),
        code: "unsupported",
        checked_at,
    }
}

/// Concrete Linux implementor of [`PlatformMediaProvider`].
pub struct LinuxMediaProvider;

impl PlatformMediaProvider for LinuxMediaProvider {
    /// Cached session-bus connection on Linux. This module compiles on every
    /// platform (`media/mod.rs` declares it unconditionally) while zbus only
    /// exists on Linux, so other platforms cache nothing.
    #[cfg(target_os = "linux")]
    type Cache = zbus::blocking::Connection;
    #[cfg(not(target_os = "linux"))]
    type Cache = ();

    fn read_status(cache: &mut Option<Self::Cache>, checked_at: u64) -> MediaSessionStatus {
        if !MPRIS_VALIDATED {
            return unsupported_status(checked_at);
        }
        #[cfg(target_os = "linux")]
        {
            mpris::read_status_impl(cache, checked_at)
        }
        #[cfg(not(target_os = "linux"))]
        {
            let _ = cache;
            unsupported_status(checked_at)
        }
    }
}

/// Command-layer entry point: observe the current media session through the
/// gated provider. Re-exported for `commands::media` so the gate above is
/// the single switch that decides the capability on Linux.
#[cfg(target_os = "linux")]
pub use mpris::read_current_status;

/// MPRIS observation internals. Everything that touches zbus lives here and
/// compiles only on Linux (zbus is a Linux-target dependency); the trait impl
/// above stays compilable on every platform.
#[cfg(target_os = "linux")]
mod mpris {
    use super::PlatformMediaProvider;
    use crate::types::MediaSessionStatus;
    use std::collections::HashMap;
    use std::sync::Mutex;
    use std::time::Duration;
    use zbus::zvariant::{Array, OwnedValue, Value};

    /// Well-known-name prefix every MPRIS player registers on the session
    /// bus (`org.mpris.MediaPlayer2.<suffix>`).
    pub(super) const MPRIS_NAME_PREFIX: &str = "org.mpris.MediaPlayer2.";

    /// Object path and interface of the MPRIS player root.
    const MPRIS_PLAYER_PATH: &str = "/org/mpris/MediaPlayer2";
    const MPRIS_PLAYER_INTERFACE: &str = "org.mpris.MediaPlayer2.Player";

    /// Per-call D-Bus timeout, enforced connection-wide by
    /// [`session_connection`]. Bounded so a hung player cannot stall the
    /// poll loop: every method call below fails after ~1s instead of
    /// blocking for the D-Bus default (25s).
    pub(super) const DBUS_METHOD_TIMEOUT: Duration = Duration::from_secs(1);

    /// Cap for title/artist strings crossing the Tauri boundary. The Windows
    /// provider does not clamp; per the privacy boundary we bound free text
    /// at 200 characters (by `char`, so multi-byte text is never split).
    pub(super) const TEXT_CAP_CHARS: usize = 200;

    // -----------------------------------------------------------------------
    // Session-bus connection handling
    // -----------------------------------------------------------------------

    /// Process-wide cached session-bus connection for the command layer.
    /// Serializing reads on one mutex is fine: every D-Bus exchange is
    /// bounded by [`DBUS_METHOD_TIMEOUT`].
    static CONNECTION: Mutex<Option<zbus::blocking::Connection>> = Mutex::new(None);

    /// Connect to the session bus with a bounded per-call method timeout.
    fn session_connection() -> zbus::Result<zbus::blocking::Connection> {
        zbus::blocking::connection::Builder::session()?
            .method_timeout(DBUS_METHOD_TIMEOUT)
            .build()
    }

    /// Return the cached session-bus connection, (re)building it on demand.
    /// Mirrors the Windows provider: the connection survives across reads
    /// and is rebuilt after a bus-level failure (see [`read_status_impl`],
    /// which drops the cache when the bus stops answering).
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

    // -----------------------------------------------------------------------
    // Player enumeration (deterministic selection)
    // -----------------------------------------------------------------------

    /// List the names currently owned on the session bus.
    fn list_bus_names(conn: &zbus::blocking::Connection) -> zbus::Result<Vec<String>> {
        let dbus = zbus::blocking::fdo::DBusProxy::new(conn)?;
        Ok(dbus
            .list_names()?
            .iter()
            .map(|name| name.as_str().to_string())
            .collect())
    }

    /// Deterministically pick the player to observe: the lexicographically
    /// first well-known name starting with `org.mpris.MediaPlayer2.`.
    ///
    /// Why deterministic: unlike Windows GSMTC, MPRIS has no "current
    /// session" concept — every registered player looks the same from the
    /// bus, so any priority rule is a heuristic. A lexicographic pick is
    /// stable across polls while the set of running players is unchanged
    /// (no flapping between players, which would make the UI jump between
    /// tracks) and reproducible for diagnostics.
    pub(super) fn select_player_name<'a>(names: &[&'a str]) -> Option<&'a str> {
        names
            .iter()
            .copied()
            .filter(|name| name.starts_with(MPRIS_NAME_PREFIX))
            .min()
    }

    // -----------------------------------------------------------------------
    // Pure mapping helpers (no D-Bus; unit-tested below)
    // -----------------------------------------------------------------------

    /// Map the raw MPRIS `PlaybackStatus` onto the two states the shared
    /// status shape carries. Matches the Windows provider: anything that is
    /// not `Playing` is reported as `paused`.
    pub(super) fn playback_status_label(raw: &str) -> &'static str {
        if raw == "Playing" {
            "playing"
        } else {
            "paused"
        }
    }

    /// Microseconds (the MPRIS timeline unit) to milliseconds. Non-positive
    /// or non-representable values map to `None`, mirroring the Windows
    /// provider's conservatism for malformed timelines.
    pub(super) fn micros_to_ms(micros: i64) -> Option<u64> {
        if micros <= 0 {
            return None;
        }
        u64::try_from(micros / 1_000).ok()
    }

    /// Bound a free-text field to [`TEXT_CAP_CHARS`] characters.
    pub(super) fn clamp_text(text: &str) -> String {
        text.chars().take(TEXT_CAP_CHARS).collect()
    }

    /// Join the MPRIS artist array into one bounded label.
    pub(super) fn artist_label(artists: &[String]) -> String {
        clamp_text(&artists.join(", "))
    }

    /// Integer percentage 0-100. Only derivable from a complete timeline;
    /// `saturating_mul` plus `min` keep any player-reported values (position
    /// past duration, absurd magnitudes) clamped and panic-free.
    pub(super) fn compute_progress(position_ms: Option<u64>, duration_ms: Option<u64>) -> u8 {
        match (position_ms, duration_ms) {
            (Some(position), Some(duration)) if duration > 0 => {
                let percent = position.saturating_mul(100) / duration;
                u8::try_from(percent.min(100)).unwrap_or(100)
            }
            _ => 0,
        }
    }

    /// `available` only when both timeline facts are known. A missing or
    /// malformed duration/position reports the Windows provider's
    /// `no-timeline` code instead of an invented timeline.
    pub(super) fn timeline_code(
        position_ms: Option<u64>,
        duration_ms: Option<u64>,
    ) -> &'static str {
        if position_ms.is_none() || duration_ms.is_none() {
            "no-timeline"
        } else {
            "available"
        }
    }

    /// The bounded shape shared by every non-success path. `available`
    /// mirrors the Windows provider: `true` once a player exists (even if
    /// its properties fail to read), `false` for bus-level failures.
    pub(super) fn partial_status(
        available: bool,
        playback_status: &'static str,
        code: &'static str,
        checked_at: u64,
    ) -> MediaSessionStatus {
        MediaSessionStatus {
            available,
            playback_status,
            progress: 0,
            position_ms: None,
            duration_ms: None,
            title: String::new(),
            artist: String::new(),
            code,
            checked_at,
        }
    }

    // -----------------------------------------------------------------------
    // Metadata extraction (typed, conservative)
    // -----------------------------------------------------------------------

    /// The metadata fields Glance Bar reads. Anything absent or wrongly
    /// typed stays `None`/empty — never invented, never a panic.
    pub(super) struct RawMetadata {
        pub(super) title: Option<String>,
        pub(super) artists: Vec<String>,
        pub(super) length_us: Option<i64>,
    }

    /// Extract the bounded fields we read from the MPRIS `Metadata` map
    /// (`a{sv}`). Wrongly typed entries map to conservative defaults.
    pub(super) fn extract_metadata(metadata: &HashMap<String, OwnedValue>) -> RawMetadata {
        RawMetadata {
            title: metadata
                .get("xesam:title")
                .and_then(|value| value.downcast_ref::<String>().ok()),
            artists: metadata
                .get("xesam:artist")
                .map(extract_artists)
                .unwrap_or_default(),
            length_us: metadata
                .get("mpris:length")
                .and_then(|value| value.downcast_ref::<i64>().ok()),
        }
    }

    /// `xesam:artist` is an array of strings; keep only well-formed entries.
    fn extract_artists(value: &OwnedValue) -> Vec<String> {
        let Ok(array) = value.downcast_ref::<&Array>() else {
            return Vec::new();
        };
        array
            .iter()
            .filter_map(|entry| match entry {
                Value::Str(artist) => Some(artist.to_string()),
                _ => None,
            })
            .collect()
    }

    // -----------------------------------------------------------------------
    // Observation read
    // -----------------------------------------------------------------------

    /// Observe the current media session over the session bus. Failure modes
    /// map onto the Windows provider's code vocabulary:
    ///
    /// - `provider-failed`  — session bus unreachable (`available=false`)
    /// - `no-session`       — no `org.mpris.MediaPlayer2.*` player registered
    /// - `no-status`        — player's `PlaybackStatus` unreadable
    /// - `no-playback-info` — player's `Metadata` unreadable
    /// - `no-timeline`      — duration or position missing/malformed
    /// - `available`        — full observation succeeded
    pub(super) fn read_status_impl(
        cache: &mut Option<zbus::blocking::Connection>,
        checked_at: u64,
    ) -> MediaSessionStatus {
        let Some(conn) = ensure_connection(cache) else {
            return partial_status(false, "unavailable", "provider-failed", checked_at);
        };

        let Ok(names) = list_bus_names(&conn) else {
            // The bus stopped answering through this connection; drop it so
            // the next read reconnects from scratch.
            *cache = None;
            return partial_status(false, "unavailable", "provider-failed", checked_at);
        };

        let name_refs: Vec<&str> = names.iter().map(String::as_str).collect();
        let Some(player_name) = select_player_name(&name_refs) else {
            return partial_status(false, "unavailable", "no-session", checked_at);
        };

        // Property caching must stay off: this is a poll observer, so every
        // read has to be a fresh `Properties.Get` call, not a signal-driven
        // cache that a quiet player would leave stale.
        let player = zbus::blocking::proxy::Builder::<zbus::blocking::Proxy>::new(&conn)
            .destination(player_name)
            .and_then(|builder| builder.path(MPRIS_PLAYER_PATH))
            .and_then(|builder| builder.interface(MPRIS_PLAYER_INTERFACE))
            .map(|builder| builder.cache_properties(zbus::proxy::CacheProperties::No))
            .and_then(zbus::blocking::proxy::Builder::build);
        let Ok(player) = player else {
            // The bus itself just answered, so keep the connection; only the
            // per-player proxy could not be built.
            return partial_status(false, "unavailable", "provider-failed", checked_at);
        };

        let raw_status: String = match player.get_property("PlaybackStatus") {
            Ok(status) => status,
            Err(_) => return partial_status(true, "unavailable", "no-status", checked_at),
        };
        let label = playback_status_label(&raw_status);

        let metadata: HashMap<String, OwnedValue> = match player.get_property("Metadata") {
            Ok(metadata) => metadata,
            Err(_) => return partial_status(true, label, "no-playback-info", checked_at),
        };
        let raw = extract_metadata(&metadata);

        // `Position` is a point-in-time snapshot; we do not extrapolate
        // between polls. A player that rejects or stalls the read (bounded
        // by DBUS_METHOD_TIMEOUT) simply loses the timeline.
        let position_ms = player
            .get_property::<i64>("Position")
            .ok()
            .and_then(micros_to_ms);
        let duration_ms = raw.length_us.and_then(micros_to_ms);

        MediaSessionStatus {
            available: true,
            playback_status: label,
            progress: compute_progress(position_ms, duration_ms),
            position_ms,
            duration_ms,
            title: raw.title.as_deref().map(clamp_text).unwrap_or_default(),
            artist: artist_label(&raw.artists),
            code: timeline_code(position_ms, duration_ms),
            checked_at,
        }
    }

    /// Read entry point for the command layer: owns the process-wide cached
    /// connection so repeated command invocations reuse one session-bus
    /// connection (requirement: cache the blocking Connection; rebuild on
    /// bus failure inside [`read_status_impl`]).
    #[must_use]
    pub fn read_current_status() -> MediaSessionStatus {
        // Poisoning only happens after a panic while holding the lock; the
        // D-Bus path is panic-free, and recovering the (possibly stale)
        // connection beats failing every future read.
        let mut cache = CONNECTION
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner);
        super::LinuxMediaProvider::read_status(&mut cache, crate::unix_time_ms())
    }
}

// ---------------------------------------------------------------------------
// Unit tests — pure logic only: no D-Bus connection is made anywhere here,
// so these pass in CI environments without a session bus. Everything below
// compiles only on Linux (zbus is a Linux-target dependency); on other
// platforms the module is a stub and has nothing to test.
// ---------------------------------------------------------------------------
#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::mpris::{
        artist_label, clamp_text, compute_progress, extract_metadata, micros_to_ms, partial_status,
        playback_status_label, select_player_name, timeline_code, TEXT_CAP_CHARS,
    };
    use super::{LinuxMediaProvider, PlatformMediaProvider, MPRIS_VALIDATED};
    use std::collections::HashMap;
    use zbus::zvariant::{OwnedValue, Value};

    /// Build an owned metadata value for tests (no D-Bus involved).
    fn owned(value: Value) -> OwnedValue {
        value.try_into_owned().expect("static metadata value")
    }

    #[test]
    fn selects_the_lexicographically_first_mpris_player() {
        let names = [
            "org.mpris.MediaPlayer2.vlc",
            "org.freedesktop.DBus",
            "org.mpris.MediaPlayer2.firefox",
            ":1.42",
            "org.gnome.Shell",
        ];
        assert_eq!(
            select_player_name(&names),
            Some("org.mpris.MediaPlayer2.firefox")
        );
    }

    #[test]
    fn ignores_unsuffixed_and_non_player_names() {
        // The bare interface name (no `.suffix`) is not a player.
        let names = [
            "org.mpris.MediaPlayer2",
            "org.mpris.MediaPlayer2x.vlc",
            "xorg.mpris.MediaPlayer2.vlc",
            ":1.5",
        ];
        assert_eq!(select_player_name(&names), None);
    }

    #[test]
    fn selects_a_single_player_and_rejects_empty_lists() {
        assert_eq!(
            select_player_name(&["org.mpris.MediaPlayer2.mpv"]),
            Some("org.mpris.MediaPlayer2.mpv")
        );
        assert_eq!(select_player_name(&[]), None);
    }

    #[test]
    fn maps_playback_status_like_the_windows_provider() {
        assert_eq!(playback_status_label("Playing"), "playing");
        assert_eq!(playback_status_label("Paused"), "paused");
        assert_eq!(playback_status_label("Stopped"), "paused");
        assert_eq!(playback_status_label(""), "paused");
        assert_eq!(playback_status_label("FastForwarding"), "paused");
    }

    #[test]
    fn converts_positive_microseconds_to_milliseconds() {
        assert_eq!(micros_to_ms(1_800_000_000), Some(1_800_000));
        assert_eq!(micros_to_ms(1_000), Some(1));
        assert_eq!(micros_to_ms(999), Some(0));
        assert_eq!(micros_to_ms(i64::MAX), Some(9_223_372_036_854_775));
    }

    #[test]
    fn rejects_non_positive_timeline_values() {
        assert_eq!(micros_to_ms(0), None);
        assert_eq!(micros_to_ms(-1), None);
        assert_eq!(micros_to_ms(i64::MIN), None);
    }

    #[test]
    fn clamps_text_to_the_bounded_character_count() {
        assert_eq!(clamp_text("short"), "short");
        assert_eq!(clamp_text(""), "");
        let long = "x".repeat(TEXT_CAP_CHARS + 50);
        assert_eq!(clamp_text(&long).chars().count(), TEXT_CAP_CHARS);
        // Multi-byte text is trimmed by characters, never mid-char bytes.
        let wide = "\u{97f3}".repeat(TEXT_CAP_CHARS + 10);
        let clamped = clamp_text(&wide);
        assert_eq!(clamped.chars().count(), TEXT_CAP_CHARS);
        assert!(clamped.chars().all(|c| c == '\u{97f3}'));
    }

    #[test]
    fn joins_artist_arrays_into_one_bounded_label() {
        assert_eq!(artist_label(&[]), "");
        assert_eq!(artist_label(&["Solo".to_string()]), "Solo");
        assert_eq!(artist_label(&["A".to_string(), "B".to_string()]), "A, B");
        let many: Vec<String> = (0..300).map(|i| i.to_string()).collect();
        assert_eq!(artist_label(&many).chars().count(), TEXT_CAP_CHARS);
    }

    #[test]
    fn derives_progress_only_from_complete_timelines() {
        assert_eq!(compute_progress(None, None), 0);
        assert_eq!(compute_progress(Some(50_000), None), 0);
        assert_eq!(compute_progress(None, Some(100_000)), 0);
        assert_eq!(compute_progress(Some(0), Some(100_000)), 0);
        assert_eq!(compute_progress(Some(50_000), Some(100_000)), 50);
        assert_eq!(compute_progress(Some(100_000), Some(100_000)), 100);
    }

    #[test]
    fn clamps_progress_for_malformed_or_absurd_timelines() {
        // Position past duration, zero duration, and u64-saturating
        // magnitudes all clamp instead of panicking or wrapping.
        assert_eq!(compute_progress(Some(250_000), Some(100_000)), 100);
        assert_eq!(compute_progress(Some(1), Some(0)), 0);
        assert_eq!(compute_progress(Some(u64::MAX), Some(1)), 100);
    }

    #[test]
    fn reports_no_timeline_when_duration_or_position_is_missing() {
        assert_eq!(timeline_code(None, None), "no-timeline");
        assert_eq!(timeline_code(Some(1), None), "no-timeline");
        assert_eq!(timeline_code(None, Some(1)), "no-timeline");
        assert_eq!(timeline_code(Some(1), Some(1)), "available");
    }

    #[test]
    fn extracts_well_formed_metadata() {
        let mut metadata: HashMap<String, OwnedValue> = HashMap::new();
        metadata.insert("xesam:title".into(), owned(Value::from("Track")));
        metadata.insert(
            "xesam:artist".into(),
            owned(Value::from(vec!["A".to_string(), "B".to_string()])),
        );
        metadata.insert("mpris:length".into(), owned(Value::from(240_000_000i64)));
        // Unrelated fields are ignored entirely.
        metadata.insert(
            "mpris:artUrl".into(),
            owned(Value::from("file:///never/read.mp3")),
        );

        let raw = extract_metadata(&metadata);
        assert_eq!(raw.title.as_deref(), Some("Track"));
        assert_eq!(raw.artists, vec!["A".to_string(), "B".to_string()]);
        assert_eq!(raw.length_us, Some(240_000_000));
    }

    #[test]
    fn maps_malformed_metadata_to_conservative_defaults() {
        let mut metadata: HashMap<String, OwnedValue> = HashMap::new();
        // Wrongly typed fields map to None/empty; nothing is coerced.
        metadata.insert("xesam:title".into(), owned(Value::from(7i64)));
        metadata.insert("xesam:artist".into(), owned(Value::from("Solo")));
        metadata.insert("mpris:length".into(), owned(Value::from("four minutes")));

        let raw = extract_metadata(&metadata);
        assert_eq!(raw.title, None);
        assert!(raw.artists.is_empty());
        assert_eq!(raw.length_us, None);
    }

    #[test]
    fn drops_non_string_artist_entries() {
        // A wrongly typed artist array (integers, not strings) yields the
        // conservative empty label; nothing is coerced into text.
        let mut metadata: HashMap<String, OwnedValue> = HashMap::new();
        metadata.insert("xesam:artist".into(), owned(Value::from(vec![7i64, 8])));

        let raw = extract_metadata(&metadata);
        assert!(raw.artists.is_empty());
    }

    #[test]
    fn empty_metadata_maps_to_conservative_defaults() {
        let raw = extract_metadata(&HashMap::new());
        assert_eq!(raw.title, None);
        assert!(raw.artists.is_empty());
        assert_eq!(raw.length_us, None);
    }

    #[test]
    fn maps_a_full_metadata_pipeline_onto_the_status_shape() {
        // 240s track, 60s in: bounded fields derived end to end without a bus.
        let mut metadata: HashMap<String, OwnedValue> = HashMap::new();
        metadata.insert("xesam:title".into(), owned(Value::from("Track")));
        metadata.insert(
            "xesam:artist".into(),
            owned(Value::from(vec!["A".to_string()])),
        );
        metadata.insert("mpris:length".into(), owned(Value::from(240_000_000i64)));

        let raw = extract_metadata(&metadata);
        let position_ms = micros_to_ms(60_000_000);
        let duration_ms = raw.length_us.and_then(micros_to_ms);
        assert_eq!(position_ms, Some(60_000));
        assert_eq!(duration_ms, Some(240_000));
        assert_eq!(compute_progress(position_ms, duration_ms), 25);
        assert_eq!(timeline_code(position_ms, duration_ms), "available");
        assert_eq!(
            raw.title.as_deref().map(clamp_text).as_deref(),
            Some("Track")
        );
    }

    #[test]
    fn error_paths_report_bounded_unavailable_statuses() {
        // MediaSessionStatus carries no PartialEq, so assert field by field.
        let bus_down = partial_status(false, "unavailable", "provider-failed", 77);
        assert!(!bus_down.available);
        assert_eq!(bus_down.playback_status, "unavailable");
        assert_eq!(bus_down.progress, 0);
        assert_eq!(bus_down.position_ms, None);
        assert_eq!(bus_down.duration_ms, None);
        assert_eq!(bus_down.title, "");
        assert_eq!(bus_down.artist, "");
        assert_eq!(bus_down.code, "provider-failed");
        assert_eq!(bus_down.checked_at, 77);

        let no_status = partial_status(true, "unavailable", "no-status", 78);
        assert!(no_status.available);
        assert_eq!(no_status.playback_status, "unavailable");
        assert_eq!(no_status.progress, 0);
        assert_eq!(no_status.title, "");

        let no_player = partial_status(false, "unavailable", "no-session", 79);
        assert!(!no_player.available);
        assert_eq!(no_player.code, "no-session");
    }

    #[test]
    fn gate_keeps_the_capability_unsupported_by_default() {
        // STAGE6 contract: until real-desktop validation is recorded, the
        // provider must report the bounded unsupported payload — and must do
        // so without touching the bus (this test runs where no session bus
        // exists). Flipping MPRIS_VALIDATED requires updating this test
        // together with the validation evidence.
        assert!(!MPRIS_VALIDATED);
        let mut cache = None;
        let status = LinuxMediaProvider::read_status(&mut cache, 1_234);
        assert!(!status.available);
        assert_eq!(status.playback_status, "unsupported");
        assert_eq!(status.code, "unsupported");
        assert_eq!(status.progress, 0);
        assert_eq!(status.position_ms, None);
        assert_eq!(status.duration_ms, None);
        assert_eq!(status.title, "");
        assert_eq!(status.artist, "");
        assert_eq!(status.checked_at, 1_234);
        assert!(cache.is_none());
    }
}
