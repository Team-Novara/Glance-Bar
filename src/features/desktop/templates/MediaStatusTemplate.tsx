import { Disc3, Pause, Play, SkipBack, SkipForward } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { useStatusToast } from "./hooks/useStatusToast";
import { StatusRail } from "./StatusRail";
import { StatusToast as StatusToastView } from "./StatusToast";

import { getDesktopStatusTemplateChromeCopy } from "@/data/desktopStatusConfig";
import { sendMediaControl, type MediaControlAction } from "@/runtime/mediaControlRuntime";
import { formatMediaTime } from "@/shared/lib/mediaTime";
import type { DesktopMediaState } from "@/types/hub";

type MediaStatusTemplateProps = {
  state: DesktopMediaState;
};

/**
 * Format the right-side time label. Only show a real time string when we
 * have both position and duration from the source — otherwise the label
 * stays hidden. The "0%" fallback used to render here, but it just made
 * the right edge look broken when the player didn't expose timeline info.
 */
function formatPositionLabel(
  positionMs: number | undefined,
  durationMs: number | undefined,
): string | undefined {
  if (positionMs !== undefined && durationMs !== undefined && durationMs > 0) {
    return formatMediaTime(positionMs, durationMs);
  }
  return undefined;
}

export function MediaStatusTemplate({ state }: MediaStatusTemplateProps) {
  const { t } = useTranslation();
  const copy = getDesktopStatusTemplateChromeCopy();
  const isPlaying = state.playbackStatus === "playing";
  const isUnavailable =
    state.playbackStatus === "unavailable" || state.playbackStatus === "unsupported";
  const { toast, showToast } = useStatusToast();

  const handleMediaAction = useCallback(
    async (action: MediaControlAction) => {
      const result = await sendMediaControl(action);
      if (result && !result.success) {
        showToast(t("media.controlFailed"));
      }
    },
    [showToast, t],
  );

  return (
    <>
      <div
        className={`product-status-icon product-status-icon-media${isPlaying ? " is-playing" : ""}`}
        aria-hidden="true"
      >
        <Disc3 size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.mediaEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={
          isUnavailable ? (
            <span className="product-status-media-unavailable-badge">
              {t("media.unavailable.badge")}
            </span>
          ) : (
            <span className="product-status-media-meta">
              {isPlaying ? <MediaVisualizer /> : null}
              <span className="product-status-media-artist">{state.artist}</span>
            </span>
          )
        }
      >
        {/* Control row: prev / play-pause / next, with a time label pinned to
            the right edge. Sits above the full-width progress bar. */}
        <div className="product-status-media-control-row">
          <div className="product-status-guest-controls">
            <button
              type="button"
              className="product-status-guest-btn"
              aria-label={t("media.previous")}
              title={t("media.previous")}
              disabled={isUnavailable}
              onClick={() => void handleMediaAction("previous")}
            >
              <SkipBack size={14} strokeWidth={2.4} />
            </button>
            <button
              type="button"
              className="product-status-guest-btn product-status-guest-btn-primary"
              aria-label={isPlaying ? t("media.pause") : t("media.play")}
              aria-pressed={isPlaying}
              title={isPlaying ? t("media.pause") : t("media.play")}
              disabled={isUnavailable}
              onClick={() => void handleMediaAction("play-pause")}
            >
              {isPlaying ? (
                <Pause size={14} strokeWidth={2.4} />
              ) : (
                <Play size={14} strokeWidth={2.4} fill="currentColor" />
              )}
            </button>
            <button
              type="button"
              className="product-status-guest-btn"
              aria-label={t("media.next")}
              title={t("media.next")}
              disabled={isUnavailable}
              onClick={() => void handleMediaAction("next")}
            >
              <SkipForward size={14} strokeWidth={2.4} />
            </button>
          </div>
          <span
            className="product-status-media-time"
            aria-label={t("media.positionLabel")}
            title={t("media.positionLabel")}
          >
            {formatPositionLabel(state.positionMs, state.durationMs) ?? ""}
          </span>
        </div>

        {/* Full-width progress bar pinned to the bottom of the template. */}
        <StatusRail
          value={state.progress}
          label={`${copy.mediaProgress} ${state.progress}%`}
          accent="violet"
          active={isPlaying}
          shimmer
        />
      </DesktopStatusTemplateFrame>
      {toast ? <StatusToastView>{toast}</StatusToastView> : null}
    </>
  );
}

function MediaVisualizer() {
  return (
    <span className="product-status-media-visualizer" aria-hidden="true">
      <span />
      <span />
      <span />
    </span>
  );
}
