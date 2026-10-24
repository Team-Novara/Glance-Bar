// ---------------------------------------------------------------------------
// macOS Media Session — MediaPlayer.framework NowPlaying observation (Stage 6).
// ---------------------------------------------------------------------------
// Observation-only: reads MPNowPlayingInfoCenter's now-playing dictionary and
// playback state and maps them onto the bounded MediaSessionStatus shape.
// Playback control stays Windows-only (`media_control` keeps returning its
// platform error on macOS, unchanged).
//
// Source choice: macOS has no public GSMTC-style "current session" registry.
// The public MediaPlayer.framework surface is MPNowPlayingInfoCenter, plus
// MPRemoteCommandCenter — a command sink for apps that play media, not a
// state source, so it is not used by this observer. Apple documents the
// default center from the perspective of a media-playing app ("holds now
// playing info about the current application"), and the system-wide Now
// Playing aggregation that Control Center displays is known to flow through
// the private MediaRemote framework — which has no objc2 bindings and is not
// App-Store-safe — so whether a non-playing observer process like Glance Bar
// sees the aggregated Now Playing info via the public default center is
// precisely what the validation gate below exists to answer on real
// hardware. NSWorkspace media-key observation was rejected as the primary
// source: it observes hardware key events rather than playback state, and
// global system-defined event monitoring is the wrong (and privacy-hostile)
// primitive for a passive poll observer.
//
// Capability gate (STAGE6_CROSS_PLATFORM_DESIGN.md: a capability must keep
// reporting unsupported until it has been validated on real target hardware):
// the implementation below is complete, but `MACOS_MEDIA_VALIDATED` is
// `false`, so `read_status` returns the same bounded `unsupported` payload as
// the old stub. Flip the const to `true` only after recording validation
// evidence on a real Mac; that flip is the single switch that enables the
// capability end to end (the command layer routes through this provider).
//
// Privacy: only bounded MediaSessionStatus fields cross the Tauri boundary —
// coarse playback state, 0-100 progress, millisecond timeline facts, and
// title/artist clamped to `TEXT_CAP_CHARS` characters. Now-playing dictionary
// keys beyond the bounded set (artwork, persistent IDs, URLs) are never read,
// and player or bundle identifiers never leave this module.
//
// Compile scope: this module is declared for every non-Windows target by
// `media/mod.rs`. The objc2 observation path compiles only on macOS; the pure
// mapping layer compiles on macOS and in test builds everywhere else, so its
// unit tests run on the Linux CI as well as the macOS CI. Compilation of the
// objc2 path is verified only by the PR CI matrix — the development
// environment this file was written in cannot build for macOS.

// The trait and status imports serve exactly the provider shell below (plus
// its command entry on non-Linux targets), so they carry the shell's cfg —
// on Linux production builds the shell is compiled out and so are these.
#[cfg(any(not(target_os = "linux"), test))]
use super::PlatformMediaProvider;
#[cfg(any(not(target_os = "linux"), test))]
use crate::types::MediaSessionStatus;

/// STAGE6 validation gate for the macOS media capability. `false` = report
/// `unsupported` (default until real-hardware validation); `true` = run the
/// full observation path implemented in [`now_playing`].
///
/// Compiled wherever the provider shell is (see [`MacosMediaProvider`]): on
/// macOS/exotic targets for the real read, and in test builds everywhere so
/// the gate-off contract below can assert it without a Mac.
#[cfg(any(not(target_os = "linux"), test))]
const MACOS_MEDIA_VALIDATED: bool = false;

/// The bounded `unsupported` payload — field-for-field identical to the
/// pre-implementation stub, so gate-off behavior is exactly what earlier
/// builds reported (and what the command layer returns on other platforms).
#[cfg(any(not(target_os = "linux"), test))]
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

/// Concrete macOS implementor of [`PlatformMediaProvider`].
///
/// Compiled on the targets whose command branch routes here (every
/// non-Windows, non-Linux target) plus test builds — mirroring how the Linux
/// provider scopes its command entry to its own consumer — so Linux
/// production builds (which route through `media::linux`) compile no unused
/// provider code, while the gate-off contract test still runs on Linux.
#[cfg(any(not(target_os = "linux"), test))]
pub struct MacosMediaProvider;

#[cfg(any(not(target_os = "linux"), test))]
impl PlatformMediaProvider for MacosMediaProvider {
    /// No cached resource on macOS. Unlike the Linux provider (which caches a
    /// session-bus connection because connecting is expensive) or the Windows
    /// provider (which caches the `WinRT` `SessionManager`),
    /// `MPNowPlayingInfoCenter::defaultCenter` is a cheap process-singleton
    /// accessor, so every read starts from the default center directly.
    type Cache = ();

    fn read_status(cache: &mut Option<Self::Cache>, checked_at: u64) -> MediaSessionStatus {
        if !MACOS_MEDIA_VALIDATED {
            return unsupported_status(checked_at);
        }
        #[cfg(target_os = "macos")]
        {
            let _ = cache;
            now_playing::read_status_impl(checked_at)
        }
        #[cfg(not(target_os = "macos"))]
        {
            let _ = cache;
            unsupported_status(checked_at)
        }
    }
}

/// Command-layer entry point: read the current media session through the
/// gated provider. Exists exactly where its consumer in
/// `commands::media::get_media_session_status` does (the non-Windows,
/// non-Linux branch), mirroring the Linux provider's cfg'd re-export — so the
/// gate above stays the single switch that decides the capability on macOS.
#[cfg(not(target_os = "linux"))]
#[must_use]
pub fn read_current_status() -> MediaSessionStatus {
    let mut cache = None;
    MacosMediaProvider::read_status(&mut cache, crate::unix_time_ms())
}

/// Pure mapping layer for the macOS now-playing read: everything between the
/// raw framework values and the bounded `MediaSessionStatus`. Contains no
/// objc2 types, so it compiles (and is unit-tested below) on every platform
/// this module is built for — the tests run in the Linux CI, not just the
/// macOS CI. It compiles under `cfg(test)` as well as on macOS so production
/// builds on platforms without the macOS read path compile no unused code.
#[cfg(any(target_os = "macos", test))]
mod mapping {
    use crate::types::MediaSessionStatus;

    /// Cap for title/artist strings crossing the Tauri boundary, consistent
    /// with the Linux MPRIS provider. Bounded by `char`, so multi-byte text
    /// is never split.
    pub(super) const TEXT_CAP_CHARS: usize = 200;

    /// The `MPNowPlayingPlaybackState` values the framework reports, as a
    /// plain platform-independent enum so the label mapping is testable off
    /// macOS.
    #[derive(Clone, Copy, Debug, PartialEq, Eq)]
    pub(super) enum NowPlayingPlaybackState {
        Unknown,
        Playing,
        Paused,
        Stopped,
        Interrupted,
    }

    /// The bounded now-playing fields Glance Bar reads. Anything absent from
    /// the dictionary stays `None`/`Unknown` — never invented, never coerced.
    pub(super) struct RawNowPlayingInfo {
        pub(super) state: NowPlayingPlaybackState,
        pub(super) title: Option<String>,
        pub(super) artist: Option<String>,
        /// Track duration in seconds (the framework's unit).
        pub(super) duration_s: Option<f64>,
        /// Elapsed playback time in seconds.
        pub(super) elapsed_s: Option<f64>,
    }

    /// Map the framework playback state onto the two states the shared status
    /// shape carries. Matches the Windows and Linux providers: anything that
    /// is not `Playing` (including `Unknown`) is reported as `paused`.
    pub(super) fn playback_label(state: NowPlayingPlaybackState) -> &'static str {
        if state == NowPlayingPlaybackState::Playing {
            "playing"
        } else {
            "paused"
        }
    }

    /// Upper bound for accepted millisecond timelines: 2^63, a power of two
    /// so it is exactly representable as f64. Anything at or above it (≈292
    /// million years) is treated as malformed rather than truncated into the
    /// u64 range.
    const MAX_TIMELINE_MS: f64 = 9_223_372_036_854_775_808.0;

    /// Seconds (the framework's timeline unit) to milliseconds. Missing,
    /// non-finite, non-positive, or u64-unrepresentable values map to `None`,
    /// mirroring the Linux provider's conservatism for malformed timelines.
    pub(super) fn seconds_to_ms(seconds: Option<f64>) -> Option<u64> {
        let seconds = seconds?;
        if !seconds.is_finite() || seconds <= 0.0 {
            return None;
        }
        let millis = seconds * 1000.0;
        if millis >= MAX_TIMELINE_MS {
            return None;
        }
        // The bounds above make this truncation lossless in practice, and
        // `as` is the only direct float→integer conversion Rust provides
        // (there is no `u64::try_from(f64)`, unlike the integer conversion
        // the Linux provider uses).
        #[allow(clippy::cast_possible_truncation, clippy::cast_sign_loss)]
        let millis = millis as u64;
        Some(millis)
    }

    /// Bound a free-text field to [`TEXT_CAP_CHARS`] characters.
    pub(super) fn clamp_text(text: &str) -> String {
        text.chars().take(TEXT_CAP_CHARS).collect()
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

    /// The bounded shape shared by every non-success path, matching the Linux
    /// provider: `available` is `false` while no now-playing publisher
    /// exists.
    pub(super) fn partial_status(
        playback_status: &'static str,
        code: &'static str,
        checked_at: u64,
    ) -> MediaSessionStatus {
        MediaSessionStatus {
            available: false,
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

    /// Map the bounded raw fields onto the shared status shape. Called with a
    /// non-empty dictionary, so the session counts as available even when
    /// individual fields are missing (mirrors the Linux provider reporting
    /// `available=true` once a player is registered).
    pub(super) fn status_from_raw(raw: &RawNowPlayingInfo, checked_at: u64) -> MediaSessionStatus {
        let position_ms = seconds_to_ms(raw.elapsed_s);
        let duration_ms = seconds_to_ms(raw.duration_s);
        MediaSessionStatus {
            available: true,
            playback_status: playback_label(raw.state),
            progress: compute_progress(position_ms, duration_ms),
            position_ms,
            duration_ms,
            title: raw.title.as_deref().map(clamp_text).unwrap_or_default(),
            artist: raw.artist.as_deref().map(clamp_text).unwrap_or_default(),
            code: timeline_code(position_ms, duration_ms),
            checked_at,
        }
    }
}

/// MediaPlayer.framework observation internals. Everything that touches
/// objc2 lives here and compiles only on macOS (the objc2 crates are
/// macOS-target dependencies); the pure mapping layer above stays compilable
/// and testable on every platform. Signatures were written against
/// objc2 0.6.4 / objc2-foundation 0.3.2 / objc2-media-player 0.3.2 sources;
/// compilation itself is verified by the PR CI macOS job only.
#[cfg(target_os = "macos")]
mod now_playing {
    use super::mapping::{self, NowPlayingPlaybackState, RawNowPlayingInfo};
    use crate::types::MediaSessionStatus;
    use objc2::runtime::AnyObject;
    use objc2_foundation::{NSDictionary, NSNumber, NSString};
    use objc2_media_player::{
        MPMediaItemPropertyArtist, MPMediaItemPropertyPlaybackDuration, MPMediaItemPropertyTitle,
        MPNowPlayingInfoCenter, MPNowPlayingInfoPropertyElapsedPlaybackTime,
        MPNowPlayingPlaybackState,
    };

    /// Observe the current media session through the default now-playing
    /// info center. Failure modes map onto the shared code vocabulary:
    ///
    /// - `no-session` — the center reports no now-playing info at all
    /// - `no-timeline` — duration or elapsed time missing/malformed
    /// - `available`  — full observation succeeded
    ///
    /// `provider-failed` / `no-status` / `no-playback-info` from the Linux
    /// vocabulary have no macOS counterpart here: the center accessor cannot
    /// fail like a bus connection can, and field extraction maps anything
    /// missing to conservative defaults instead of failing the read.
    pub(super) fn read_status_impl(checked_at: u64) -> MediaSessionStatus {
        // SAFETY: `defaultCenter` is a plain class accessor with no
        // documented preconditions; it returns the process-wide center.
        let center = unsafe { MPNowPlayingInfoCenter::defaultCenter() };
        // SAFETY: the property is declared `NSDictionary<NSString, id>` in
        // the framework headers, which is exactly the bound generic type
        // this binding returns.
        let info = unsafe { center.nowPlayingInfo() };
        // SAFETY: returns a plain enum value by copy; no preconditions.
        let state = unsafe { center.playbackState() };

        let Some(info) = info else {
            return mapping::partial_status("unavailable", "no-session", checked_at);
        };

        let raw = extract_raw(&info, state);
        mapping::status_from_raw(&raw, checked_at)
    }

    /// Read the bounded field set from the now-playing dictionary. Anything
    /// absent or wrongly typed stays `None` — never coerced.
    fn extract_raw(
        info: &NSDictionary<NSString, AnyObject>,
        state: MPNowPlayingPlaybackState,
    ) -> RawNowPlayingInfo {
        // SAFETY: the four framework string constants below are non-null
        // `&'static NSString`s initialized at framework load time.
        RawNowPlayingInfo {
            state: playback_state(state),
            title: string_field(info, unsafe { MPMediaItemPropertyTitle }),
            artist: string_field(info, unsafe { MPMediaItemPropertyArtist }),
            duration_s: number_field(info, unsafe { MPMediaItemPropertyPlaybackDuration }),
            elapsed_s: number_field(info, unsafe { MPNowPlayingInfoPropertyElapsedPlaybackTime }),
        }
    }

    /// Map the framework enum onto the pure mapping enum by its integer
    /// value; anything unexpected falls back to `Unknown`, which the label
    /// mapping reports conservatively as `paused`.
    fn playback_state(raw: MPNowPlayingPlaybackState) -> NowPlayingPlaybackState {
        match raw.0 {
            1 => NowPlayingPlaybackState::Playing,
            2 => NowPlayingPlaybackState::Paused,
            3 => NowPlayingPlaybackState::Stopped,
            4 => NowPlayingPlaybackState::Interrupted,
            _ => NowPlayingPlaybackState::Unknown,
        }
    }

    /// Read a string field, taking the framework's key by reference (the
    /// extern-static read happens at the call site). Returns `None` when the
    /// key is absent or the value is not an NSString.
    fn string_field(
        info: &NSDictionary<NSString, AnyObject>,
        key: &'static NSString,
    ) -> Option<String> {
        let value = info.objectForKey(key)?;
        let text = value.downcast_ref::<NSString>()?;
        Some(text.to_string())
    }

    /// Read a numeric field as seconds. The dependency enables the `NSValue`
    /// feature of objc2-foundation (see Cargo.toml), which carries the typed
    /// `NSNumber` binding, so the value is downcast to `NSNumber` and read
    /// through `as_f64` (the binding's `doubleValue` wrapper). Returns `None`
    /// when the key is absent or the value is not an `NSNumber` — NSNumber
    /// subclasses like `NSDecimalNumber` still pass the downcast.
    fn number_field(
        info: &NSDictionary<NSString, AnyObject>,
        key: &'static NSString,
    ) -> Option<f64> {
        let value = info.objectForKey(key)?;
        let number = value.downcast_ref::<NSNumber>()?;
        Some(number.as_f64())
    }
}

// ---------------------------------------------------------------------------
// Unit tests — pure mapping logic only: no objc2 call is made anywhere here
// (the gate-off contract returns before the platform branch), so these run on
// every platform this module compiles for, including the Linux CI.
// ---------------------------------------------------------------------------
#[cfg(test)]
mod tests {
    use super::mapping::{
        clamp_text, compute_progress, partial_status, playback_label, seconds_to_ms,
        status_from_raw, timeline_code, NowPlayingPlaybackState as State, RawNowPlayingInfo,
        TEXT_CAP_CHARS,
    };
    use super::{MacosMediaProvider, PlatformMediaProvider, MACOS_MEDIA_VALIDATED};

    /// Build a raw snapshot with every bounded field populated.
    fn full_raw() -> RawNowPlayingInfo {
        RawNowPlayingInfo {
            state: State::Playing,
            title: Some("Track".to_string()),
            artist: Some("Artist".to_string()),
            duration_s: Some(240.0),
            elapsed_s: Some(60.0),
        }
    }

    #[test]
    fn gate_keeps_the_capability_unsupported_by_default() {
        // STAGE6 contract: until real-hardware validation is recorded, the
        // provider must report the bounded unsupported payload — and must do
        // so without touching any framework API (this test runs on Linux,
        // where the objc2 path does not even compile). Flipping
        // MACOS_MEDIA_VALIDATED requires updating this test together with
        // the validation evidence.
        assert!(!MACOS_MEDIA_VALIDATED);
        let mut cache = None;
        let status = MacosMediaProvider::read_status(&mut cache, 1_234);
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

    #[test]
    fn maps_playback_states_like_the_windows_provider() {
        assert_eq!(playback_label(State::Playing), "playing");
        assert_eq!(playback_label(State::Paused), "paused");
        assert_eq!(playback_label(State::Stopped), "paused");
        assert_eq!(playback_label(State::Interrupted), "paused");
        // Unknown is reported conservatively as paused, never invented.
        assert_eq!(playback_label(State::Unknown), "paused");
    }

    #[test]
    fn converts_positive_seconds_to_milliseconds() {
        assert_eq!(seconds_to_ms(Some(1_800.0)), Some(1_800_000));
        assert_eq!(seconds_to_ms(Some(1.5)), Some(1_500));
        // Sub-millisecond elapsed times truncate to zero, mirroring the
        // Linux provider's microseconds→milliseconds rounding.
        assert_eq!(seconds_to_ms(Some(0.000_5)), Some(0));
        assert_eq!(seconds_to_ms(None), None);
    }

    #[test]
    fn rejects_non_finite_or_absurd_timeline_values() {
        assert_eq!(seconds_to_ms(Some(0.0)), None);
        assert_eq!(seconds_to_ms(Some(-1.0)), None);
        assert_eq!(seconds_to_ms(Some(f64::NAN)), None);
        assert_eq!(seconds_to_ms(Some(f64::INFINITY)), None);
        // Durations past the u64 millisecond range are refused, not wrapped.
        assert_eq!(seconds_to_ms(Some(1.0e300)), None);
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
    fn error_paths_report_bounded_unavailable_statuses() {
        // MediaSessionStatus carries no PartialEq, so assert field by field.
        let no_session = partial_status("unavailable", "no-session", 77);
        assert!(!no_session.available);
        assert_eq!(no_session.playback_status, "unavailable");
        assert_eq!(no_session.progress, 0);
        assert_eq!(no_session.position_ms, None);
        assert_eq!(no_session.duration_ms, None);
        assert_eq!(no_session.title, "");
        assert_eq!(no_session.artist, "");
        assert_eq!(no_session.code, "no-session");
        assert_eq!(no_session.checked_at, 77);
    }

    #[test]
    fn maps_a_full_now_playing_pipeline_onto_the_status_shape() {
        // 240s track, 60s in, playing: bounded fields derived end to end
        // without any framework call.
        let status = status_from_raw(&full_raw(), 500);
        assert!(status.available);
        assert_eq!(status.playback_status, "playing");
        assert_eq!(status.position_ms, Some(60_000));
        assert_eq!(status.duration_ms, Some(240_000));
        assert_eq!(status.progress, 25);
        assert_eq!(status.title, "Track");
        assert_eq!(status.artist, "Artist");
        assert_eq!(status.code, "available");
        assert_eq!(status.checked_at, 500);
    }

    #[test]
    fn maps_sparse_now_playing_info_to_conservative_defaults() {
        // A present-but-sparse dictionary still counts as an available
        // session; every missing field maps to its conservative default.
        let raw = RawNowPlayingInfo {
            state: State::Unknown,
            title: None,
            artist: None,
            duration_s: None,
            elapsed_s: None,
        };
        let status = status_from_raw(&raw, 51);
        assert!(status.available);
        assert_eq!(status.playback_status, "paused");
        assert_eq!(status.progress, 0);
        assert_eq!(status.position_ms, None);
        assert_eq!(status.duration_ms, None);
        assert_eq!(status.title, "");
        assert_eq!(status.artist, "");
        assert_eq!(status.code, "no-timeline");
        assert_eq!(status.checked_at, 51);
    }

    #[test]
    fn malformed_timeline_values_lose_the_timeline_but_keep_the_session() {
        // NaN/absurd elapsed times drop position/duration only; the bounded
        // text and availability survive, and the code names the loss.
        let mut raw = full_raw();
        raw.elapsed_s = Some(f64::NAN);
        let status = status_from_raw(&raw, 52);
        assert!(status.available);
        assert_eq!(status.position_ms, None);
        assert_eq!(status.duration_ms, Some(240_000));
        assert_eq!(status.progress, 0);
        assert_eq!(status.code, "no-timeline");
    }

    #[test]
    fn clamps_free_text_inside_the_pipeline() {
        let mut raw = full_raw();
        raw.title = Some("x".repeat(TEXT_CAP_CHARS + 50));
        raw.artist = Some("\u{97f3}".repeat(TEXT_CAP_CHARS + 10));
        let status = status_from_raw(&raw, 53);
        assert_eq!(status.title.chars().count(), TEXT_CAP_CHARS);
        assert_eq!(status.artist.chars().count(), TEXT_CAP_CHARS);
        assert!(status.artist.chars().all(|c| c == '\u{97f3}'));
    }
}
