import { invoke } from "@tauri-apps/api/core";
import { Clipboard, ExternalLink } from "lucide-react";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";

import { DesktopStatusTemplateFrame } from "./DesktopStatusTemplateFrame";
import { GuestSourceHealthIndicator } from "./GuestSourceHealthIndicator";
import { useStatusToast } from "./hooks/useStatusToast";
import { StatusToast as StatusToastView } from "./StatusToast";

import { getDesktopStatusTemplateChromeCopy } from "@/entities/status/config";
import type { DesktopClipboardState } from "@/entities";

type ClipboardStatusTemplateProps = {
  state: DesktopClipboardState;
};

function detectUrl(text: string): string | null {
  const cleaned = text.replace(/\u2026$/, "").trim();
  try {
    const url = new URL(cleaned);
    if (url.protocol === "http:" || url.protocol === "https:") {
      return url.href;
    }
  } catch {
    // not a URL
  }
  return null;
}

export function ClipboardStatusTemplate({ state }: ClipboardStatusTemplateProps) {
  const { t } = useTranslation();
  const copy = getDesktopStatusTemplateChromeCopy();
  const url = useMemo(() => detectUrl(state.copiedText), [state.copiedText]);
  const { toast, showToast } = useStatusToast();

  const handleOpenUrl = useCallback(async () => {
    if (!url) return;
    try {
      await invoke("open_url_in_browser", { url });
    } catch {
      showToast(t("clipboard.openFailed"));
    }
  }, [showToast, url, t]);

  return (
    <>
      <div className="product-status-icon product-status-icon-clipboard" aria-hidden="true">
        <Clipboard size={20} strokeWidth={2.2} />
        <GuestSourceHealthIndicator sourceHealth={state.sourceHealth} />
      </div>
      <DesktopStatusTemplateFrame
        eyebrow={copy.clipboardEyebrow}
        title={state.title}
        subtitle={state.subtitle}
        meta={
          url ? (
            <span className="product-status-template-meta-actions">
              <span>{state.detail}</span>
              <button
                type="button"
                className="product-status-guest-btn product-status-guest-btn-primary"
                aria-label={t("clipboard.openInBrowser")}
                onClick={() => void handleOpenUrl()}
                title={t("clipboard.openInBrowser")}
              >
                <ExternalLink size={14} strokeWidth={2.4} />
              </button>
            </span>
          ) : (
            <span>{state.detail}</span>
          )
        }
      >
        <span className="product-status-clipboard-text">{state.copiedText}</span>
      </DesktopStatusTemplateFrame>
      {toast ? <StatusToastView>{toast}</StatusToastView> : null}
    </>
  );
}
