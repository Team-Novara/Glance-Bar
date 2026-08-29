import { Bell, X } from "lucide-react";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { useStatusToast } from "./hooks/useStatusToast";
import { StatusToast as StatusToastView } from "./StatusToast";

import { getDesktopStatusTemplateChromeCopy } from "@/data/desktopStatusConfig";
import { dismissNotification } from "@/runtime/actions/notificationDismissRuntime";
import type { DesktopNotificationState } from "@/types/hub";

type NotificationStatusTemplateProps = {
  state: DesktopNotificationState;
};

export function NotificationStatusTemplate({ state }: NotificationStatusTemplateProps) {
  const { t } = useTranslation();
  const copy = getDesktopStatusTemplateChromeCopy();
  const { toast, showToast } = useStatusToast();

  const handleDismiss = useCallback(async () => {
    const result = await dismissNotification();
    if (result && !result.success) {
      showToast(t("notification.dismissFailed"));
    }
  }, [showToast, t]);

  return (
    <>
      <div className="product-status-icon product-status-icon-notification" aria-hidden="true">
        <Bell size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.notificationEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={
          <span className="product-status-template-meta-actions">
            <span>
              <span>{state.sender}</span>
              <span>{state.message}</span>
            </span>
            <button
              type="button"
              className="product-status-guest-btn product-status-guest-btn-primary"
              aria-label={t("notification.dismiss")}
              title={t("notification.dismiss")}
              onClick={() => void handleDismiss()}
            >
              <X size={14} strokeWidth={2.4} />
            </button>
          </span>
        }
      />
      {toast ? <StatusToastView>{toast}</StatusToastView> : null}
    </>
  );
}
