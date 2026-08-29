// ---------------------------------------------------------------------------
// Windows Media Session (GSMTC) commands.
// ---------------------------------------------------------------------------

use crate::types::MediaSessionStatus;
use tauri::State;

use crate::types::MediaRequestSender;

#[cfg(windows)]
#[tauri::command]
pub async fn get_media_session_status(
    sender: State<'_, MediaRequestSender>,
) -> Result<MediaSessionStatus, String> {
    use std::sync::mpsc as std_mpsc;

    let sender_clone: MediaRequestSender = sender.inner().clone();
    let (reply_tx, reply_rx) = std_mpsc::channel();
    let tx = sender_clone
        .lock()
        .map_err(|_| "media sender lock poisoned".to_string())?;
    tx.send(crate::types::MediaRequest::Read(reply_tx))
        .map_err(|_| "media thread channel closed".to_string())?;
    drop(tx);
    Ok(reply_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .unwrap_or_else(|_| MediaSessionStatus {
            available: false,
            playback_status: "unavailable",
            progress: 0,
            position_ms: None,
            duration_ms: None,
            title: String::new(),
            artist: String::new(),
            code: "sta-timeout",
            checked_at: crate::unix_time_ms(),
        }))
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn get_media_session_status() -> Result<MediaSessionStatus, String> {
    Ok(MediaSessionStatus {
        available: false,
        playback_status: "unsupported",
        progress: 0,
        position_ms: None,
        duration_ms: None,
        title: String::new(),
        artist: String::new(),
        code: "unsupported",
        checked_at: crate::unix_time_ms(),
    })
}

#[cfg(windows)]
#[tauri::command]
pub async fn media_control(
    action: String,
    sender: State<'_, MediaRequestSender>,
) -> Result<crate::types::MediaControlResult, String> {
    use std::sync::mpsc as std_mpsc;

    let sender_clone: MediaRequestSender = sender.inner().clone();
    let (reply_tx, reply_rx) = std_mpsc::channel();
    let tx = sender_clone
        .lock()
        .map_err(|_| "media sender lock poisoned".to_string())?;
    tx.send(crate::types::MediaRequest::Action(action, reply_tx))
        .map_err(|_| "media thread channel closed".to_string())?;
    drop(tx);
    let result: crate::types::MediaControlResult = reply_rx
        .recv_timeout(std::time::Duration::from_secs(5))
        .map_err(|_| "media thread timed out".to_string())?
        .map_err(|e| format!("media action failed: {e}"))?;

    Ok(result)
}

#[cfg(not(windows))]
#[tauri::command]
pub async fn media_control(action: String) -> Result<crate::types::MediaControlResult, String> {
    let _ = action;
    Err("media control is only supported on Windows".into())
}

// ---------------------------------------------------------------------------
// Media-control action execution — invoked by the MTA media thread.
// ---------------------------------------------------------------------------
#[cfg(windows)]
pub fn execute_media_action(action: &str) -> Result<crate::types::MediaControlResult, String> {
    let timeout = std::time::Duration::from_secs(5);

    let async_op = windows::Media::Control::GlobalSystemMediaTransportControlsSessionManager::RequestAsync()
        .map_err(|e| format!("media manager request failed: {e}"))?;
    let manager = crate::media::mta_wait_async(async_op, timeout)
        .map_err(|e| format!("media manager get failed: {e}"))?;

    let session = manager
        .GetCurrentSession()
        .map_err(|e| format!("no active media session: {e}"))?;

    let success = match action {
        "play-pause" => {
            let playback_info = session.GetPlaybackInfo()
                .map_err(|e| format!("playback info failed: {e}"))?;
            let is_playing = playback_info.PlaybackStatus()
                .map(|s| s == windows::Media::Control::GlobalSystemMediaTransportControlsSessionPlaybackStatus::Playing)
                .unwrap_or(false);

            if is_playing {
                let op = session.TryPauseAsync()
                    .map_err(|e| format!("pause dispatch failed: {e}"))?;
                crate::media::mta_wait_async(op, timeout)
                    .map_err(|e| format!("pause failed: {e}"))?
            } else {
                let op = session.TryPlayAsync()
                    .map_err(|e| format!("play dispatch failed: {e}"))?;
                crate::media::mta_wait_async(op, timeout)
                    .map_err(|e| format!("play failed: {e}"))?
            }
        }
        "next" => {
            let op = session.TrySkipNextAsync()
                .map_err(|e| format!("skip next dispatch failed: {e}"))?;
            crate::media::mta_wait_async(op, timeout)
                .map_err(|e| format!("skip next failed: {e}"))?
        }
        "previous" => {
            let op = session.TrySkipPreviousAsync()
                .map_err(|e| format!("skip previous dispatch failed: {e}"))?;
            crate::media::mta_wait_async(op, timeout)
                .map_err(|e| format!("skip previous failed: {e}"))?
        }
        _ => return Err(format!("unknown media action: {action}")),
    };

    Ok(crate::types::MediaControlResult { success })
}
