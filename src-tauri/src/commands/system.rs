// ---------------------------------------------------------------------------
// System performance, overlay policy, autostart, and stub commands.
// ---------------------------------------------------------------------------

use crate::clamp_percent;
use crate::types::{
    DownloadControlResult, DownloadFolderStatus, OverlayPolicy, SharedDesktopProductState,
    SystemPerformanceDiagnosticPayload, SystemPerformanceSnapshot, SystemPerformanceStatusPayload,
};
use sysinfo::{Networks, System};
use tauri::State;

#[tauri::command]
pub async fn get_system_performance(
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
) -> Result<SystemPerformanceStatusPayload, String> {
    let (cpu, memory) = tauri::async_runtime::spawn_blocking(|| {
        let mut system = System::new_all();

        system.refresh_cpu();
        std::thread::sleep(sysinfo::MINIMUM_CPU_UPDATE_INTERVAL);
        system.refresh_cpu();
        system.refresh_memory();

        let cpu = clamp_percent(system.global_cpu_info().cpu_usage() as f64);
        let memory = if system.total_memory() == 0 {
            0
        } else {
            clamp_percent((system.used_memory() as f64 / system.total_memory() as f64) * 100.0)
        };

        (cpu, memory)
    })
    .await
    .map_err(|e| format!("spawn_blocking failed: {e}"))?;

    let (download_speed, upload_speed) = sample_network_speeds(&state);

    let checked_at = crate::unix_time_ms();

    Ok(SystemPerformanceStatusPayload {
        snapshot: SystemPerformanceSnapshot {
            cpu,
            memory,
            download_speed,
            upload_speed,
        },
        diagnostic: SystemPerformanceDiagnosticPayload {
            quality: "live",
            code: "available",
            source: "tauri-event",
        },
        checked_at,
    })
}

#[tauri::command]
pub fn get_overlay_policy(
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
) -> OverlayPolicy {
    let foreground_fullscreen = crate::commands::window::foreground_window_is_fullscreen();
    let (always_float, avoid_fullscreen) = state
        .lock()
        .map(|state| {
            (
                state.preferences.always_float,
                state.preferences.avoid_fullscreen,
            )
        })
        .unwrap_or((true, true));
    let should_float =
        compute_overlay_policy(always_float, avoid_fullscreen, foreground_fullscreen);

    OverlayPolicy {
        foreground_fullscreen,
        should_float,
    }
}

/// Pure policy core so the always-float / avoid-fullscreen / fullscreen truth
/// table is unit-testable without a live Tauri state or a foreground window.
///
/// `should_float` (drive the window topmost) is only true when the user wants
/// the bar to float at all (`always_float`). On top of that, fullscreen
/// avoidance suppresses floating while a foreground window covers a monitor.
pub(crate) fn compute_overlay_policy(
    always_float: bool,
    avoid_fullscreen: bool,
    foreground_fullscreen: bool,
) -> bool {
    if !always_float {
        return false;
    }
    if avoid_fullscreen {
        !foreground_fullscreen
    } else {
        true
    }
}

// ---------------------------------------------------------------------------
// Network speed sampling — delta-based rate measurement between invocations.
// ---------------------------------------------------------------------------
pub(crate) fn sample_network_speeds(state: &SharedDesktopProductState<tauri::Wry>) -> (u64, u64) {
    let now = std::time::Instant::now();

    if let Ok(mut guard) = state.lock() {
        let cache = &mut guard.perf_cache;

        let networks = cache
            .networks
            .get_or_insert_with(Networks::new_with_refreshed_list);
        networks.refresh();

        let received_bytes: u64 = networks.values().map(|data| data.received()).sum();
        let transmitted_bytes: u64 = networks.values().map(|data| data.transmitted()).sum();

        let elapsed = cache
            .network_sample
            .as_ref()
            .map_or(std::time::Duration::ZERO, |sample| {
                now.duration_since(sample.sampled_at)
            });
        let rate = calculate_network_rate(
            cache.network_sample.as_ref(),
            received_bytes,
            transmitted_bytes,
            elapsed,
        );

        cache.network_sample = Some(crate::types::NetworkSample {
            received_bytes,
            transmitted_bytes,
            sampled_at: now,
        });

        return (rate.download_bps, rate.upload_bps);
    }

    (0, 0)
}

const MIN_NETWORK_SAMPLE_INTERVAL_SECS: f64 = 0.05;
const MAX_NETWORK_SPEED_BPS: u64 = 10_000_000_000;

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct NetworkRate {
    pub download_bps: u64,
    pub upload_bps: u64,
}

/// Calculates bounded rates from monotonically sampled interface counters.
/// A counter reset is treated as a zero rate for that direction rather than
/// exposing a wrapped/negative value to the frontend.
pub(crate) fn calculate_network_rate(
    previous: Option<&crate::types::NetworkSample>,
    received_bytes: u64,
    transmitted_bytes: u64,
    elapsed: std::time::Duration,
) -> NetworkRate {
    let Some(previous) = previous else {
        return NetworkRate {
            download_bps: 0,
            upload_bps: 0,
        };
    };

    if elapsed.as_secs_f64() <= MIN_NETWORK_SAMPLE_INTERVAL_SECS {
        return NetworkRate {
            download_bps: 0,
            upload_bps: 0,
        };
    }

    NetworkRate {
        download_bps: bounded_rate(
            received_bytes.saturating_sub(previous.received_bytes),
            elapsed,
        ),
        upload_bps: bounded_rate(
            transmitted_bytes.saturating_sub(previous.transmitted_bytes),
            elapsed,
        ),
    }
}

fn bounded_rate(delta_bytes: u64, elapsed: std::time::Duration) -> u64 {
    ((delta_bytes as f64 / elapsed.as_secs_f64()) as u64).min(MAX_NETWORK_SPEED_BPS)
}

// ---------------------------------------------------------------------------
// Autostart — delegated to tauri-plugin-autostart.
// ---------------------------------------------------------------------------
#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn get_autostart_enabled(
    autostart: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
) -> bool {
    autostart.is_enabled().unwrap_or(false)
}

#[cfg(not(any(target_os = "android", target_os = "ios")))]
#[tauri::command]
pub fn set_autostart_enabled(
    autostart: tauri::State<'_, tauri_plugin_autostart::AutoLaunchManager>,
    enabled: bool,
) -> Result<(), String> {
    if enabled {
        autostart
            .enable()
            .map_err(|e| format!("enable autostart failed: {e}"))?;
    } else {
        autostart
            .disable()
            .map_err(|e| format!("disable autostart failed: {e}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Honest not-implemented stubs — real providers are pending (Stage 5+).
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn pause_download() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: false })
}

#[tauri::command]
pub fn resume_download() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: false })
}

#[tauri::command]
pub fn cancel_download() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: false })
}

#[tauri::command]
pub fn install_update() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}

#[tauri::command]
pub fn dismiss_notification() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}

// ---------------------------------------------------------------------------
// Download folder state — real monitoring for Windows, unsupported elsewhere.
// ---------------------------------------------------------------------------
// Stateless, on-demand snapshot of the user's Downloads folder. The event
// stream (`status-center://download-changed`, emitted by the download monitor)
// carries live changes; this command gives the provider an immediate snapshot on
// start so the bar does not wait for the next change event. Mirrors the media
// session's `get_media_session_status` command.
#[tauri::command]
pub fn get_download_state() -> DownloadFolderStatus {
    #[cfg(windows)]
    {
        let now = crate::unix_time_ms();
        let Some(dir) = crate::monitoring::downloads_dir() else {
            return DownloadFolderStatus {
                status: "idle",
                active_downloads: 0,
                progress: None,
                progress_accuracy: "none",
                controllable: false,
                code: "unsupported",
                checked_at: now,
            };
        };

        let (count, code) = match crate::monitoring::scan_downloads(&dir) {
            Ok((_, _, count)) => (count, "available"),
            Err(code) => (0, code),
        };
        if code != "available" {
            return DownloadFolderStatus {
                status: "error",
                active_downloads: 0,
                progress: None,
                progress_accuracy: "none",
                controllable: false,
                code,
                checked_at: now,
            };
        }
        let status = if count > 0 { "active" } else { "idle" };

        DownloadFolderStatus {
            status,
            active_downloads: count,
            progress: None,
            progress_accuracy: "none",
            controllable: false,
            code: "available",
            checked_at: now,
        }
    }

    #[cfg(not(windows))]
    {
        DownloadFolderStatus {
            status: "idle",
            active_downloads: 0,
            progress: None,
            progress_accuracy: "none",
            controllable: false,
            code: "unsupported",
            checked_at: crate::unix_time_ms(),
        }
    }
}

// ---------------------------------------------------------------------------
// Tests — pure-function overlay policy core only.
// ---------------------------------------------------------------------------
// `compute_overlay_policy` has no side effects and no Tauri state, so the full
// always-float / avoid-fullscreen / fullscreen truth table is coverable in
// unit tests.

#[cfg(test)]
mod tests {
    use super::*;
    use std::time::{Duration, Instant};

    #[test]
    fn floats_when_always_float_set_and_no_fullscreen() {
        assert!(compute_overlay_policy(true, true, false));
    }

    #[test]
    fn suppresses_float_when_avoiding_fullscreen_and_fullscreen_active() {
        assert!(!compute_overlay_policy(true, true, true));
    }

    #[test]
    fn floats_through_fullscreen_when_not_avoiding_it() {
        assert!(compute_overlay_policy(true, false, true));
    }

    #[test]
    fn never_floats_when_always_float_disabled_regardless_of_other_settings() {
        assert!(!compute_overlay_policy(false, true, false));
        assert!(!compute_overlay_policy(false, true, true));
        assert!(!compute_overlay_policy(false, false, false));
        assert!(!compute_overlay_policy(false, false, true));
    }

    #[test]
    fn network_rate_returns_zero_for_first_sample_and_short_interval() {
        let now = Instant::now();
        let previous = crate::types::NetworkSample {
            received_bytes: 100,
            transmitted_bytes: 50,
            sampled_at: now,
        };

        assert_eq!(
            calculate_network_rate(None, 200, 100, Duration::from_secs(1)),
            NetworkRate {
                download_bps: 0,
                upload_bps: 0,
            }
        );
        assert_eq!(
            calculate_network_rate(Some(&previous), 200, 100, Duration::from_millis(100),),
            NetworkRate {
                download_bps: 1_000,
                upload_bps: 500,
            }
        );
    }

    #[test]
    fn network_rate_treats_each_counter_reset_as_zero() {
        let previous = crate::types::NetworkSample {
            received_bytes: 1_000,
            transmitted_bytes: 2_000,
            sampled_at: Instant::now(),
        };

        assert_eq!(
            calculate_network_rate(Some(&previous), 500, 2_500, Duration::from_secs(1),),
            NetworkRate {
                download_bps: 0,
                upload_bps: 500,
            }
        );
    }

    #[test]
    fn network_rate_caps_extreme_deltas() {
        let previous = crate::types::NetworkSample {
            received_bytes: 0,
            transmitted_bytes: 0,
            sampled_at: Instant::now(),
        };

        let rate = calculate_network_rate(
            Some(&previous),
            u64::MAX,
            u64::MAX,
            Duration::from_millis(100),
        );
        assert_eq!(
            rate,
            NetworkRate {
                download_bps: MAX_NETWORK_SPEED_BPS,
                upload_bps: MAX_NETWORK_SPEED_BPS,
            }
        );
    }
}
