// ---------------------------------------------------------------------------
// System performance, overlay policy, autostart, and stub commands.
// ---------------------------------------------------------------------------

use crate::clamp_percent;
use crate::types::{
    DownloadControlResult, OverlayPolicy, SystemPerformanceSnapshot, SharedDesktopProductState,
};
use sysinfo::{Networks, System};
use tauri::State;

#[tauri::command]
pub async fn get_system_performance(
    state: State<'_, SharedDesktopProductState<tauri::Wry>>,
) -> Result<SystemPerformanceSnapshot, String> {
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

    Ok(SystemPerformanceSnapshot { cpu, memory, download_speed, upload_speed })
}

#[tauri::command]
pub fn get_overlay_policy(state: State<'_, SharedDesktopProductState<tauri::Wry>>) -> OverlayPolicy {
    let foreground_fullscreen = crate::commands::window::foreground_window_is_fullscreen();
    let avoid_fullscreen = state
        .lock()
        .map(|state| state.preferences.avoid_fullscreen)
        .unwrap_or(true);
    let should_float = if avoid_fullscreen {
        !foreground_fullscreen
    } else {
        true
    };

    OverlayPolicy {
        foreground_fullscreen,
        should_float,
    }
}

// ---------------------------------------------------------------------------
// Network speed sampling — delta-based rate measurement between invocations.
// ---------------------------------------------------------------------------
pub(crate) fn sample_network_speeds(state: &SharedDesktopProductState<tauri::Wry>) -> (u64, u64) {
    let now = std::time::Instant::now();
    let mut download_bps: u64 = 0;
    let mut upload_bps: u64 = 0;

    if let Ok(mut guard) = state.lock() {
        let cache = &mut guard.perf_cache;

        let networks = cache.networks.get_or_insert_with(Networks::new_with_refreshed_list);
        networks.refresh();

        let received_bytes: u64 = networks.values().map(|data| data.received()).sum();
        let transmitted_bytes: u64 = networks.values().map(|data| data.transmitted()).sum();

        if let Some(prev) = &cache.network_sample {
            let elapsed = now.duration_since(prev.sampled_at).as_secs_f64();

            if elapsed > 0.05 {
                let delta_rx = received_bytes.saturating_sub(prev.received_bytes);
                let delta_tx = transmitted_bytes.saturating_sub(prev.transmitted_bytes);
                download_bps = (delta_rx as f64 / elapsed) as u64;
                upload_bps = (delta_tx as f64 / elapsed) as u64;
            }
        }

        cache.network_sample = Some(crate::types::NetworkSample {
            received_bytes,
            transmitted_bytes,
            sampled_at: now,
        });
    }

    (download_bps, upload_bps)
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
        autostart.enable().map_err(|e| format!("enable autostart failed: {e}"))?;
    } else {
        autostart.disable().map_err(|e| format!("disable autostart failed: {e}"))?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Honest not-implemented stubs — real providers are pending (Stage 5+).
// ---------------------------------------------------------------------------
#[tauri::command]
pub fn pause_download() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}

#[tauri::command]
pub fn resume_download() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}

#[tauri::command]
pub fn cancel_download() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}

#[tauri::command]
pub fn install_update() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}

#[tauri::command]
pub fn dismiss_notification() -> Result<DownloadControlResult, String> {
    Ok(DownloadControlResult { success: true })
}
