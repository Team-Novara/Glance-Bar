import { RefreshCw } from "lucide-react";
import { Download } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { useStatusToast } from "./hooks/useStatusToast";
import { StatusToast as StatusToastView } from "./StatusToast";

import { getDesktopStatusTemplateChromeCopy } from "@/data/desktopStatusConfig";
import { installUpdate } from "@/runtime/actions/updateInstallRuntime";
import type { DesktopUpdateState } from "@/types/hub";

type UpdateStatusTemplateProps = {
  state: DesktopUpdateState;
};

export function UpdateStatusTemplate({ state }: UpdateStatusTemplateProps) {
  const { t } = useTranslation();
  const copy = getDesktopStatusTemplateChromeCopy();
  const { toast, showToast } = useStatusToast();

  const handleInstall = useCallback(async () => {
    const result = await installUpdate();
    if (result && !result.success) {
      showToast(t("update.installFailed"));
    }
  }, [showToast, t]);

  return (
    <>
      <div className="product-status-icon product-status-icon-update" aria-hidden="true">
        <RefreshCw size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.updateEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={
          <span className="product-status-template-meta-actions">
            <span>
              <span>{state.detail}</span>
            </span>
            <button
              type="button"
              className="product-status-guest-btn product-status-guest-btn-primary"
              aria-label={t("update.installNow")}
              title={t("update.installNow")}
              onClick={() => void handleInstall()}
            >
              <Download size={14} strokeWidth={2.4} />
            </button>
          </span>
        }
      />
      {toast ? <StatusToastView>{toast}</StatusToastView> : null}
    </>
  );
}
