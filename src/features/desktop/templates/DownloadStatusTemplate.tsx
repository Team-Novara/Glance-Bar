import { Download } from "lucide-react";
import { Pause, Play, X } from "lucide-react";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";

import type { DesktopDownloadState } from "@/entities";
import { getDesktopStatusTemplateChromeCopy } from "@/entities/status/config";
import { sendDownloadControl } from "@/runtime/actions/downloadControlRuntime";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { useStatusToast } from "./hooks/useStatusToast";
import { StatusRail } from "./StatusRail";
import { StatusToast as StatusToastView } from "./StatusToast";


type DownloadStatusTemplateProps = {
  state: DesktopDownloadState;
};

function useDownloadPaused(): [boolean, () => void] {
  const [paused, setPaused] = useState(false);
  const toggle = useCallback(() => setPaused((p) => !p), []);
  return [paused, toggle];
}

export function DownloadStatusTemplate({ state }: DownloadStatusTemplateProps) {
  const { t } = useTranslation();
  const copy = getDesktopStatusTemplateChromeCopy();
  const canControl = state.controllable ?? state.source === "mock";
  const hasExactProgress =
    state.progressAccuracy === "exact" ||
    (state.progressAccuracy === undefined && state.source === "mock");
  const indeterminate = !hasExactProgress;
  const [paused, togglePaused] = useDownloadPaused();
  const { toast, showToast } = useStatusToast();

  const handleControl = useCallback(
    async (action: "pause" | "resume" | "cancel") => {
      const result = await sendDownloadControl(action);
      if (result && !result.success) {
        showToast(t("download.controlFailed"));
      }
    },
    [showToast, t],
  );

  return (
    <>
      <div className="product-status-icon product-status-icon-download" aria-hidden="true">
        <Download size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.downloadEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={
          <span className="product-status-template-meta-actions">
            <span>
              <span>{state.detail}</span>
              {indeterminate ? null : <span>{state.progress}%</span>}
            </span>
            {canControl ? (
              <>
                <button
                  type="button"
                  className="product-status-guest-btn"
                  aria-label={paused ? t("download.resume") : t("download.pause")}
                  title={paused ? t("download.resume") : t("download.pause")}
                  aria-pressed={paused}
                  onClick={() => {
                    togglePaused();
                    void handleControl(paused ? "resume" : "pause");
                  }}
                >
                  {paused ? (
                    <Play size={14} strokeWidth={2.4} fill="currentColor" />
                  ) : (
                    <Pause size={14} strokeWidth={2.4} />
                  )}
                </button>
                <button
                  type="button"
                  className="product-status-guest-btn"
                  aria-label={t("download.cancel")}
                  title={t("download.cancel")}
                  onClick={() => void handleControl("cancel")}
                >
                  <X size={14} strokeWidth={2.4} />
                </button>
              </>
            ) : null}
          </span>
        }
      >
        <StatusRail
          value={paused ? 0 : state.progress}
          label={
            indeterminate
              ? t("download.progressUnknown")
              : `${copy.downloadProgress} ${paused ? 0 : state.progress}%`
          }
          accent="green"
          active={!paused}
          indeterminate={indeterminate}
        />
      </DesktopStatusTemplateFrame>
      {toast ? <StatusToastView>{toast}</StatusToastView> : null}
    </>
  );
}
