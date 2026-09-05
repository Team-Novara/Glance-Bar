import { MoonStar } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import type { DesktopFocusState } from "@/entities";
import { getDesktopStatusTemplateChromeCopy } from "@/entities/status/config";
import { stopFocusSession } from "@/runtime/actions/focusStopRuntime";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { useStatusToast } from "./hooks/useStatusToast";
import { StatusToast as StatusToastView } from "./StatusToast";

type FocusStatusTemplateProps = {
  state: DesktopFocusState;
};

export function FocusStatusTemplate({ state }: FocusStatusTemplateProps) {
  const { t } = useTranslation();
  const copy = getDesktopStatusTemplateChromeCopy();
  const canControl = state.active !== false && state.controllable === true;
  const { toast, showToast } = useStatusToast();

  const handleStop = useCallback(async () => {
    const result = await stopFocusSession();
    if (result && !result.success) {
      showToast(t("focus.stopFailed"));
    }
  }, [showToast, t]);

  return (
    <>
      <div className="product-status-icon product-status-icon-focus" aria-hidden="true">
        <MoonStar size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.focusEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={
          <span className="product-status-template-meta-actions">
            <span>
              <span>{state.sessionLabel}</span>
              <span>{state.detail}</span>
            </span>
            {canControl ? (
              <button
                type="button"
                className="product-status-guest-btn product-status-guest-btn-primary"
                aria-label={t("focus.stop")}
                title={t("focus.stop")}
                onClick={() => void handleStop()}
              >
                <MoonStar size={14} strokeWidth={2.4} />
              </button>
            ) : null}
          </span>
        }
      />
      {toast ? <StatusToastView>{toast}</StatusToastView> : null}
    </>
  );
}
